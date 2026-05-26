'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Stories } from '@/components/story/stories';
import { PostCard } from '@/components/post/post-card';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { CardSkeleton } from '@/components/design-system/skeleton';
import { SuggestedUsers } from '@/components/explore/suggested-users';
import { usePullToRefresh, useScrollPreservation } from '@/lib/hooks/use-pull-to-refresh';
import { PullIndicator } from '@/components/feed/pull-indicator';
import Link from 'next/link';

interface FeedPost {
  id: string;
  user_id: string;
  content: string | null;
  location: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
  is_liked: boolean;
  is_saved: boolean;
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
  media: Array<{ id: string; storage_path: string; media_type: string; sort_order: number }>;
}

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  expires_at: string;
  created_at: string;
  user: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean };
  hasViewed: boolean;
}

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export default function FeedPage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followingCount, setFollowingCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const postsRef = useRef<FeedPost[]>([]);
  const userRef = useRef<Profile | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const supabase = createClient();

  useScrollPreservation({ key: 'feed' });

  const loadPosts = useCallback(async (userId: string, excludeIds: string[]) => {
    // Pure following-only timeline (user's own posts + followed users' posts)
    const { data: feedPosts } = await supabase.rpc('get_following_feed', {
      p_user_id: userId,
      p_limit: 20,
      p_exclude_ids: excludeIds.length > 0 ? excludeIds : null,
    });
    return feedPosts || [];
  }, [supabase]);

  const handleRefresh = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const freshPosts = await loadPosts(authUser.id, []);
    seenIdsRef.current = new Set(freshPosts.map((p: FeedPost) => p.id));
    setPosts(freshPosts);
    postsRef.current = freshPosts;
    setHasMore(freshPosts.length >= 20);
  }, [loadPosts, supabase]);

  const { pullDistance, isRefreshing, phase, progress, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // Initial load — parallelized for speed
  useEffect(() => {
    async function loadData() {
      try {
        setError(null);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setLoading(false); return; }

        // Phase 1: profile + following in parallel
        const [profileRes, followingRes] = await Promise.all([
          supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', authUser.id).single(),
          supabase.from('follows').select('following_id').eq('follower_id', authUser.id),
        ]);

        let profile = profileRes.data;
        if (!profile) {
          const tempUsername = `user_${authUser.id.slice(0, 8)}`;
          const { data: newProfile } = await supabase
            .from('profiles')
            .upsert({ id: authUser.id, username: tempUsername, display_name: authUser.email?.split('@')[0] || 'User' }, { onConflict: 'id' })
            .select('id, username, display_name, avatar_url')
            .single();
          profile = newProfile;
        }

        if (!profile) { setLoading(false); return; }
        setUser(profile);
        userRef.current = profile;

        const fIds = new Set(followingRes.data?.map(f => f.following_id) || []);
        setFollowingIds(fIds);
        setFollowingCount(fIds.size);

        // Show shell immediately — posts + stories load in background
        setLoading(false);

        // Phase 2: posts + stories in parallel (non-blocking)
        const allUserIds = [authUser.id, ...Array.from(fIds)];
        const [postsRes, storiesRes, viewsRes] = await Promise.all([
          loadPosts(authUser.id, []),
          supabase
            .from('stories')
            .select('id, user_id, media_url, media_type, visibility, expires_at, created_at, user:profiles!inner(id, username, display_name, avatar_url, is_verified)')
            .in('user_id', allUserIds)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(50),
          supabase.from('story_views').select('story_id').eq('user_id', authUser.id),
        ]);

        // Process posts
        const feedPosts = postsRes || [];
        seenIdsRef.current = new Set(feedPosts.map((p: FeedPost) => p.id));
        setPosts(feedPosts);
        postsRef.current = feedPosts;
        if (feedPosts.length < 20) setHasMore(false);

        // Process stories
        let filteredStories = storiesRes.data || [];
        const closeFriendOwnerIds = filteredStories
          .filter((s: any) => s.visibility === 'close_friends' && s.user_id !== authUser.id)
          .map((s: any) => s.user_id);

        if (closeFriendOwnerIds.length > 0) {
          const { data: closeFriendRows } = await supabase
            .from('close_friends')
            .select('user_id')
            .in('user_id', [...new Set(closeFriendOwnerIds)])
            .eq('friend_id', authUser.id);
          const closeFriendSet = new Set(closeFriendRows?.map(r => r.user_id) || []);
          filteredStories = filteredStories.filter((s: any) => {
            if (s.user_id === authUser.id) return true;
            if (!s.visibility || s.visibility === 'public') return true;
            if (s.visibility === 'followers') return true;
            if (s.visibility === 'close_friends') return closeFriendSet.has(s.user_id);
            return true;
          });
        }

        const viewedSet = new Set(viewsRes.data?.map(v => v.story_id) || []);
        const mutedUsers = JSON.parse(localStorage.getItem('kw-muted-users') || '[]') as string[];
        if (mutedUsers.length > 0) {
          const mutedSet = new Set(mutedUsers);
          filteredStories = filteredStories.filter((s: any) => !mutedSet.has(s.user_id));
        }

        setStories(filteredStories.map((s: any) => ({
          id: s.id, user_id: s.user_id, media_url: s.media_url, media_type: s.media_type || 'image',
          expires_at: s.expires_at, created_at: s.created_at, user: s.user, hasViewed: viewedSet.has(s.id),
        })));

      } catch (e) {
        setError('Failed to load your feed. Please try again.');
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading || seenIdsRef.current.size === 0) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        setLoadingMore(true);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const excludeIds = Array.from(seenIdsRef.current);
          const morePosts = await loadPosts(authUser.id, excludeIds);
          const freshPosts = morePosts.filter((p: FeedPost) => !seenIdsRef.current.has(p.id));
          freshPosts.forEach((p: FeedPost) => seenIdsRef.current.add(p.id));
          setPosts(prev => [...prev, ...freshPosts]);
          if (morePosts.length < 20) setHasMore(false);
        }
        setLoadingMore(false);
      }
    }, { rootMargin: '400px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadPosts, supabase]);

  // Realtime: new post insert
  useEffect(() => {
    const channel = supabase
      .channel('feed-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
        const newPost = payload.new as { id: string; user_id: string };
        if (seenIdsRef.current.has(newPost.id)) return;
        // Only show if from a followed user
        if (!followingIds.has(newPost.user_id) && newPost.user_id !== userRef.current?.id) return;

        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        const freshPosts = await loadPosts(authUser.id, []);
        const newPost2 = freshPosts.find((p: FeedPost) => p.id === newPost.id);
        if (newPost2 && !seenIdsRef.current.has(newPost2.id)) {
          seenIdsRef.current.add(newPost2.id);
          setPosts(prev => [newPost2, ...prev]);
          postsRef.current = [newPost2, ...postsRef.current];
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [followingIds]);

  if (loading) {
    return (
      <MainLayout>
        <div className="feed-container py-2 space-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="feed-container py-8 text-center">
          <p className="text-[var(--text-muted)] mb-4">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
            className="px-4 py-2 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-lg text-sm font-medium"
          >
            Try Again
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen" {...pullHandlers}>
        {/* Pull indicator — sits above feed, height creates the gap */}
        <div style={{
          height: pullDistance > 0 || isRefreshing ? Math.max(pullDistance, isRefreshing ? 48 : 0) : 0,
          transition: pullDistance === 0 ? 'height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
          overflow: 'hidden',
        }}>
          <PullIndicator pullDistance={Math.max(pullDistance, isRefreshing ? 48 : 0)} progress={progress} phase={phase} isRefreshing={isRefreshing} />
        </div>

        {/* Mobile Header */}
        <div className="lg:hidden sticky top-0 z-20 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-tight">KWEN</h1>
            <Link href="/notifications" aria-label="Notifications" className="p-1.5 -mr-1.5 rounded-full active:bg-[var(--bg-secondary)] transition-colors relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:block sticky top-0 z-20 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
          <div className="feed-container py-3">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Home</h1>
          </div>
        </div>

        <div className="feed-container">
          {/* Composer */}
          {user && (
            <div className="py-2.5 px-0.5 border-b border-[var(--border-subtle)]">
              <Link href="/create" aria-label="Create a new post" className="flex items-center gap-3 group">
                <Avatar src={user.avatar_url} name={user.display_name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] text-[var(--text-muted)] py-2.5 px-3.5 rounded-full bg-[var(--bg-secondary)] border border-transparent group-active:border-[var(--border-soft)] transition-colors-fast">
                    What&apos;s happening?
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Stories */}
          {(stories.length > 0 || user) && (
            <div className="py-3 border-b border-[var(--border-subtle)]">
              <Stories
                stories={stories}
                currentUser={user ? { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url } : undefined}
                onUploadSuccess={() => { setTimeout(() => window.location.reload(), 500); }}
              />
            </div>
          )}

          {/* Suggested Users (when following < 20) */}
          {followingCount < 20 && !loading && <SuggestedUsers />}

          {/* Posts */}
          {posts.length > 0 ? (
            <div>
              {posts.map((post) => (
                <PostCard key={post.id} post={{
                  id: post.id,
                  user: { id: post.user_id, username: post.username, displayName: post.display_name, avatar: post.avatar_url || '', isVerified: post.is_verified },
                  content: post.content || '',
                  images: post.media?.map(m => m.storage_path) || [],
                  mediaTypes: post.media?.map(m => m.media_type) || [],
                  likes: post.like_count,
                  comments: post.comment_count,
                  shares: post.share_count || 0,
                  saves: post.save_count || 0,
                  isLiked: post.is_liked,
                  isSaved: post.is_saved,
                  createdAt: post.created_at,
                  location: post.location || undefined,
                }} />
              ))}
              <div ref={sentinelRef} className="h-1" />
              {loadingMore && (
                <div className="py-4 flex justify-center">
                  <div className="animate-spin h-5 w-5 border-2 border-[var(--text-muted)] border-t-transparent rounded-full" />
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center text-[var(--text-muted)]">
              <p>No posts yet. Follow some users or create your first post!</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
