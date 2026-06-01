'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/main-layout';
import { PostCard } from '@/components/post/post-card';
import { GridSkeleton } from '@/components/design-system/skeleton';
import { createClient } from '@/lib/supabase/client';
import { useScrollPreservation } from '@/lib/hooks/use-pull-to-refresh';
import Link from 'next/link';

interface TagPost {
  id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
  like_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
  is_liked: boolean;
  is_saved: boolean;
  media: Array<{ id: string; storage_path: string; media_type: string; sort_order: number }>;
}

export function TagPageClient() {
  const params = useParams();
  const tag = decodeURIComponent(params.tag as string);

  const [posts, setPosts] = useState<TagPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useScrollPreservation({ key: `tag-${tag}` });

  // Initial load
  useEffect(() => {
    async function init() {
      try {
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setCurrentUserId(user.id);
        const { data, error: rpcError } = await supabase.rpc('search_explore', {
          p_user_id: user?.id ?? '00000000-0000-0000-0000-000000000000',
          p_query: tag,
          p_type: 'posts',
          p_limit: 30,
        });

        if (rpcError) {
          setError('Failed to load posts');
          return;
        }

        const tagPosts = (data || []) as TagPost[];
        setPosts(tagPosts);
        setSeenIds(tagPosts.map(p => p.id));
        if (tagPosts.length < 30) setHasMore(false);
      } catch {
        setError('Something went wrong');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [supabase, tag]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading || seenIds.length === 0) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        setLoadingMore(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { data } = await supabase.rpc('search_explore', {
            p_user_id: user?.id ?? '00000000-0000-0000-0000-000000000000',
            p_query: tag,
            p_type: 'posts',
            p_limit: 30,
          });
          const morePosts = ((data || []) as TagPost[]).filter(p => !seenIds.includes(p.id));
          setPosts(prev => [...prev, ...morePosts]);
          setSeenIds(prev => [...prev, ...morePosts.map(p => p.id)]);
          if (morePosts.length < 30) setHasMore(false);
        } catch {
          // silent fail for infinite scroll
        } finally {
          setLoadingMore(false);
        }
      }
    }, { rootMargin: '400px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [seenIds, hasMore, loading, loadingMore, supabase, tag]);

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="mb-4">
          <Link href="/explore" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors-fast mb-2 inline-block">
            &larr; Back to Explore
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">#{tag}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Posts with this hashtag</p>
        </div>

        {loading ? (
          <GridSkeleton rows={6} />
        ) : error ? (
          <div className="text-center py-10">
            <p className="text-[var(--text-muted)] mb-3">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-lg text-sm font-medium"
            >
              Try Again
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-[var(--text-muted)]">No posts found with #{tag}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                isOwnPost={post.user_id === currentUserId}
                post={{
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
                }}
                onDelete={() => setPosts(prev => prev.filter(p => p.id !== post.id))}
              />
            ))}
            {hasMore && <div ref={sentinelRef} className="h-1" />}
            {loadingMore && <GridSkeleton rows={3} />}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
