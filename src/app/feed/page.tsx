'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Stories } from '@/components/story/stories';
import { PostCard } from '@/components/post/post-card';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { CardSkeleton } from '@/components/design-system/skeleton';
import { usePullToRefresh, useScrollPreservation } from '@/lib/hooks/use-pull-to-refresh';
import Link from 'next/link';

interface FeedPost {
  id: string;
  user_id: string;
  content: string | null;
  location: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_saved: boolean;
  display_name: string;
  username: string;
  avatar_url: string | null;
  media: Array<{ id: string; storage_path: string; media_type: string; sort_order: number }>;
  tier: string;
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
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Scroll preservation
  useScrollPreservation({ key: 'feed' });

  const loadPosts = useCallback(async (userId: string, cursorVal: string | null) => {
    const { data: feedPosts } = await supabase.rpc('get_discovery_feed', {
      p_user_id: userId,
      p_limit: 20,
      p_cursor: cursorVal,
    });
    return feedPosts || [];
  }, [supabase]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const freshPosts = await loadPosts(authUser.id, null);
    setPosts(freshPosts);
    if (freshPosts.length > 0) setCursor(freshPosts[freshPosts.length - 1].created_at);
    setHasMore(freshPosts.length >= 20);
  }, [loadPosts, supabase]);

  const { pullDistance, isRefreshing, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // Initial load
  useEffect(() => {
    async function loadData() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      let { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', authUser.id)
        .single();

      if (!profile) {
        const tempUsername = `user_${authUser.id.slice(0, 8)}`;
        const { data: newProfile } = await supabase
          .from('profiles')
          .upsert({ id: authUser.id, username: tempUsername, display_name: authUser.email?.split('@')[0] || 'User' }, { onConflict: 'id' })
          .select('id, username, display_name, avatar_url')
          .single();
        profile = newProfile;
      }

      setUser(profile);

      const feedPosts = await loadPosts(authUser.id, null);
      setPosts(feedPosts);
      if (feedPosts.length > 0) {
        setCursor(feedPosts[feedPosts.length - 1].created_at);
      }
      if (feedPosts.length < 20) setHasMore(false);

      // Stories
      const { data: following } = await supabase.from('follows').select('following_id').eq('follower_id', authUser.id);
      const followingIds = following?.map(f => f.following_id) || [];
      const allUserIds = [authUser.id, ...followingIds];

      const { data: userStories } = await supabase
        .from('stories')
        .select('id, user_id, media_url, media_type, visibility, expires_at, created_at, user:profiles!inner(id, username, display_name, avatar_url, is_verified)')
        .in('user_id', allUserIds)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      // Filter by visibility
      let filteredStories = userStories || [];

      // Get close friends list for current user (to check who added me as close friend)
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
          // Own stories always visible
          if (s.user_id === authUser.id) return true;
          // Public stories visible to all
          if (!s.visibility || s.visibility === 'public') return true;
          // Followers stories visible to followers (already filtered by followingIds)
          if (s.visibility === 'followers') return true;
          // Close friends stories: only if I'm in their close friends list
          if (s.visibility === 'close_friends') return closeFriendSet.has(s.user_id);
          return true;
        });
      }

      const { data: views } = await supabase.from('story_views').select('story_id').eq('user_id', authUser.id);
      const viewedSet = new Set(views?.map(v => v.story_id) || []);

      setStories(filteredStories.map((s: any) => ({
        id: s.id, user_id: s.user_id, media_url: s.media_url, media_type: s.media_type || 'image',
        expires_at: s.expires_at, created_at: s.created_at, user: s.user, hasViewed: viewedSet.has(s.id),
      })));

      setLoading(false);
    }
    loadData();
  }, []);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading || !cursor) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        setLoadingMore(true);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const morePosts = await loadPosts(authUser.id, cursor);
          setPosts(prev => [...prev, ...morePosts]);
          if (morePosts.length > 0) {
            setCursor(morePosts[morePosts.length - 1].created_at);
          }
          if (morePosts.length < 20) setHasMore(false);
        }
        setLoadingMore(false);
      }
    }, { rootMargin: '200px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, hasMore, loading, loadingMore]);

  // Realtime: new post insert (without full reload)
  useEffect(() => {
    const channel = supabase
      .channel('feed-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
        const newPost = payload.new as { id: string; user_id: string; content: string; created_at: string };
        if (!user) return;
        // Don't duplicate
        if (posts.some(p => p.id === newPost.id)) return;
        // Fetch full post data
        const { data: fullPost } = await supabase.rpc('get_discovery_feed', {
          p_user_id: user.id,
          p_limit: 1,
          p_cursor: null,
        });
        // Only insert if it's from a followed user or high engagement
        if (fullPost && fullPost.length > 0) {
          setPosts(prev => [fullPost[0], ...prev]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, posts]);

  if (loading) {
    return (
      <MainLayout>
        <div className="feed-container py-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen" {...pullHandlers} style={{ transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined, transition: pullDistance === 0 ? 'transform 0.3s ease' : undefined }}>
        {/* Pull-to-refresh indicator */}
        {pullDistance > 0 && (
          <div className="flex items-center justify-center py-3 text-sm text-[var(--text-muted)]" style={{ marginTop: -pullDistance }}>
            {isRefreshing ? 'Refreshing...' : pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        )}
        {/* Mobile Header */}
        <div className="lg:hidden sticky top-0 z-20 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-[var(--text-primary)]">KWEN</h1>
            <Link href="/notifications" aria-label="Notifications" className="p-2 rounded-full hover:bg-[var(--bg-secondary)] transition-colors-fast relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]" aria-hidden="true">
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
            <div className="py-3 border-b border-[var(--border-subtle)]">
              <Link href="/create" aria-label="Create a new post" className="flex items-start gap-3 group">
                <Avatar src={user.avatar_url} name={user.display_name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] text-[var(--text-muted)] py-2.5 px-4 rounded-xl bg-[var(--bg-secondary)] border border-transparent group-hover:border-[var(--border-soft)] transition-colors-fast">
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

          {/* Posts */}
          {posts.length > 0 ? (
            <div>
              {posts.map((post) => (
                <PostCard key={post.id} post={{
                  id: post.id,
                  user: { id: post.user_id, username: post.username, displayName: post.display_name, avatar: post.avatar_url || '', isVerified: false, bio: '', followers: 0, following: 0, posts: 0 },
                  content: post.content || '',
                  images: post.media?.map(m => m.storage_path) || [],
                  mediaTypes: post.media?.map(m => m.media_type) || [],
                  likes: post.like_count,
                  comments: post.comment_count,
                  shares: 0,
                  isLiked: post.is_liked,
                  isSaved: post.is_saved,
                  createdAt: post.created_at,
                  location: post.location || undefined,
                }} />
              ))}
              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-1" />
              {loadingMore && (
                <div className="py-8 flex justify-center">
                  <div className="animate-spin h-5 w-5 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-[var(--text-muted)]">
              <p>No posts yet. Follow some users or create your first post!</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}