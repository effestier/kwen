'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Stories } from '@/components/story/stories';
import { PostCard } from '@/components/post/post-card';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { PaginationLoader } from '@/components/ui/loader';
import { PageSkeleton } from '@/components/design-system/skeleton';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { SuggestedUsers } from '@/components/explore/suggested-users';
import { useScrollPreservation } from '@/lib/hooks/use-pull-to-refresh';
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

interface FeedClientProps {
  initialProfile: Profile;
  initialFollowingIds: string[];
}

export function FeedClient({ initialProfile, initialFollowingIds }: FeedClientProps) {
  const [user, setUser] = useState<Profile | null>(initialProfile);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set(initialFollowingIds));
  const [followingCount, setFollowingCount] = useState(initialFollowingIds.length);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const postsRef = useRef<FeedPost[]>([]);
  const userRef = useRef<Profile | null>(initialProfile);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const feedInitializedRef = useRef(false); // BUG 4 fix: separate init flag
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useScrollPreservation({ key: 'feed' });

  const loadPosts = useCallback(async (userId: string, excludeIds: string[]) => {
    // Try RPC first, fall back to direct query
    const { data: rpcPosts, error: rpcError } = await supabase.rpc('get_following_feed', {
      p_user_id: userId,
      p_limit: 20,
      p_exclude_ids: excludeIds.length > 0 ? excludeIds : null,
    });
    if (!rpcError && rpcPosts && rpcPosts.length > 0) {
      return rpcPosts;
    }
    if (rpcError) {
      console.warn('[feed] RPC failed, falling back to direct query:', rpcError.message);
    }

    // Fallback: fetch follows first, then build feed from direct queries
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);

    const followingIds = following?.map((f: any) => f.following_id) || [];
    const allUserIds = [userId, ...followingIds];
    if (allUserIds.length === 0) return [];

    // Build exclusion filter
    const excludeFilter = excludeIds.length > 0
      ? `id.not.in.(${excludeIds.join(',')})`
      : undefined;

    // Fetch posts from followed users + self
    // Note: posts table has 'shares' but NOT 'likes' or 'comments' — those are separate tables
    const { data: rawPosts, error: postsError } = await supabase
      .from('posts')
      .select(`
        id, user_id, content, location, created_at, shares,
        profiles!inner (
          display_name, username, avatar_url, is_verified
        ),
        post_media (
          id, storage_path, media_type, sort_order
        )
      `)
      .in('user_id', allUserIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (postsError) {
      console.error('[feed] Direct posts query failed:', postsError.message, postsError);
      return [];
    }

    if (!rawPosts || rawPosts.length === 0) return [];

    // Get like/comment counts and like/save status in parallel
    const postIds = rawPosts.map((p: any) => p.id);
    const [{ data: likedPosts }, { data: savedPosts }] = await Promise.all([
      supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
      supabase.from('saved_posts').select('post_id').eq('user_id', userId).in('post_id', postIds),
    ]);

    const likedSet = new Set((likedPosts || []).map((l: any) => l.post_id));
    const savedSet = new Set((savedPosts || []).map((s: any) => s.post_id));

    // Map to FeedPost format
    return rawPosts.map((p: any) => ({
      id: p.id,
      user_id: p.user_id,
      content: p.content,
      location: p.location,
      created_at: p.created_at,
      like_count: 0,  // Would need a separate count query; RPC does this properly
      comment_count: 0,
      save_count: 0,
      share_count: p.shares || 0,
      is_liked: likedSet.has(p.id),
      is_saved: savedSet.has(p.id),
      display_name: p.profiles?.display_name || '',
      username: p.profiles?.username || '',
      avatar_url: p.profiles?.avatar_url || null,
      is_verified: p.profiles?.is_verified || false,
      media: (p.post_media || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }));
  }, [supabase]);

  const handleRefresh = useCallback(async () => {
    feedInitializedRef.current = false;
    const freshPosts = await loadPosts(initialProfile.id, []);
    seenIdsRef.current = new Set(freshPosts.map((p: FeedPost) => p.id));
    setPosts(freshPosts);
    postsRef.current = freshPosts;
    setHasMore(freshPosts.length >= 20);
    feedInitializedRef.current = true;
  }, [loadPosts, initialProfile.id]);

  // Initial load — profile already provided, load posts + stories
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setError(null);
        const authUserId = initialProfile.id;
        const allUserIds = [authUserId, ...initialFollowingIds];

        // Load posts — main content, must succeed
        let feedPosts: FeedPost[] = [];
        try {
          feedPosts = await loadPosts(authUserId, []);
        } catch (err) {
          console.error('[FEED] posts load error:', err);
        }

        if (cancelled) return;

        // Process posts
        const posts = feedPosts || [];
        seenIdsRef.current = new Set(posts.map((p: FeedPost) => p.id));
        setPosts(posts);
        postsRef.current = posts;
        if (posts.length < 20) setHasMore(false);
        feedInitializedRef.current = true;

        // Load stories + views (non-critical, don't fail the feed)
        let filteredStories: any[] = [];
        try {
          const [storiesRes, viewsRes] = await Promise.all([
            supabase
              .from('stories')
              .select('id, user_id, media_url, media_type, visibility, expires_at, created_at, user:profiles!inner(id, username, display_name, avatar_url, is_verified)')
              .in('user_id', allUserIds)
              .gt('expires_at', new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(50),
            supabase.from('story_views').select('story_id').eq('user_id', authUserId),
          ]);

          if (storiesRes.error) console.error('[FEED] stories error:', storiesRes.error);
          filteredStories = storiesRes.data || [];

          const closeFriendOwnerIds = filteredStories
            .filter((s: any) => s.visibility === 'close_friends' && s.user_id !== authUserId)
            .map((s: any) => s.user_id);

          if (closeFriendOwnerIds.length > 0) {
            const { data: closeFriendRows } = await supabase
              .from('close_friends')
              .select('user_id')
              .in('user_id', [...new Set(closeFriendOwnerIds)])
              .eq('friend_id', authUserId);
            const closeFriendSet = new Set(closeFriendRows?.map(r => r.user_id) || []);
            filteredStories = filteredStories.filter((s: any) => {
              if (s.user_id === authUserId) return true;
              if (!s.visibility || s.visibility === 'public') return true;
              if (s.visibility === 'followers') return true;
              if (s.visibility === 'close_friends') return closeFriendSet.has(s.user_id);
              return true;
            });
          }

          const viewedSet = new Set(viewsRes.data?.map(v => v.story_id) || []);
          let mutedUsers: string[] = [];
          try { const stored = localStorage.getItem('kw-muted-users'); if (stored) mutedUsers = JSON.parse(stored); } catch { /* ignore */ }
          if (mutedUsers.length > 0) {
            const mutedSet = new Set(mutedUsers);
            filteredStories = filteredStories.filter((s: any) => !mutedSet.has(s.user_id));
          }

          if (!cancelled) {
            setStories(filteredStories.map((s: any) => ({
              id: s.id, user_id: s.user_id, media_url: s.media_url, media_type: s.media_type || 'image',
              expires_at: s.expires_at, created_at: s.created_at, user: s.user, hasViewed: viewedSet.has(s.id),
            })));
          }
        } catch (storyErr) {
          console.error('[FEED] stories load error:', storyErr);
          // Stories failed but posts still loaded — don't kill the feed
        }

      } catch (e: any) {
        console.error('Feed load error:', e);
        setError('Failed to load your feed. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [initialProfile, initialFollowingIds, loadPosts, supabase]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading || !feedInitializedRef.current) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        setLoadingMore(true);
        try {
          const excludeIds = Array.from(seenIdsRef.current);
          const morePosts = await loadPosts(initialProfile.id, excludeIds);
          const freshPosts = morePosts.filter((p: FeedPost) => !seenIdsRef.current.has(p.id));
          freshPosts.forEach((p: FeedPost) => seenIdsRef.current.add(p.id));
          setPosts(prev => [...prev, ...freshPosts]);
          if (morePosts.length < 20) setHasMore(false);
        } catch {
          // Network error — allow retry on next scroll
        } finally {
          setLoadingMore(false);
        }
      }
    }, { rootMargin: '400px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadPosts, initialProfile.id]);

  // Realtime: new post insert
  // BUG 3 fix: Fetch only the new post by ID instead of re-fetching entire feed
  useEffect(() => {
    const channel = supabase
      .channel('feed-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
        const newPost = payload.new as { id: string; user_id: string };
        if (seenIdsRef.current.has(newPost.id)) return;
        if (!followingIds.has(newPost.user_id) && newPost.user_id !== userRef.current?.id) return;

        // Fetch just the new post by ID instead of entire feed
        const { data: postData } = await supabase
          .from('posts')
          .select('*, user:profiles!posts_user_id_fkey(id, username, display_name, avatar_url, is_verified)')
          .eq('id', newPost.id)
          .single();

        if (postData) {
          const feedPost: FeedPost = {
            id: postData.id,
            user_id: postData.user_id,
            content: postData.content,
            location: postData.location,
            created_at: postData.created_at,
            like_count: 0,
            comment_count: 0,
            save_count: 0,
            share_count: 0,
            is_liked: false,
            is_saved: false,
            display_name: postData.user?.display_name || '',
            username: postData.user?.username || '',
            avatar_url: postData.user?.avatar_url || null,
            is_verified: postData.user?.is_verified || false,
            media: [],
          };
          seenIdsRef.current.add(feedPost.id);
          setPosts(prev => [feedPost, ...prev]);
          postsRef.current = [feedPost, ...postsRef.current];
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [followingIds, initialProfile.id, supabase]);

  if (loading) {
    return (
      <MainLayout initialProfile={initialProfile}>
        <PageSkeleton />
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="feed-container py-12 text-center">
          <p className="text-sm text-[var(--text-muted)] mb-4">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
            className="px-5 py-2 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-full text-sm font-medium active:opacity-80 transition-opacity"
          >
            Try Again
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout initialProfile={initialProfile}>
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen">

        {/* Mobile: header provided by MobileHeader in layout */}

        {/* Desktop Header */}
        <div className="hidden lg:block sticky top-0 z-20 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
          <div className="max-w-2xl mx-auto">
            <h1 className="heading-page">Home</h1>
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
              {posts.map((post, index) => (
                <PostCard key={post.id} feedIndex={index} isInfiniteScroll={index >= 20} isOwnPost={post.user_id === initialProfile.id} post={{
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
              {loadingMore && <PaginationLoader />}
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </div>
              <p className="text-[var(--text-primary)] font-medium mb-1">No posts yet</p>
              <p className="text-sm text-[var(--text-muted)]">Follow some users or create your first post!</p>
            </div>
          )}
        </div>
      </div>
      </PullToRefresh>
    </MainLayout>
  );
}
