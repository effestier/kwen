'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { PostCard } from '@/components/post/post-card';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/design-system/skeleton';
import { PageLoader } from '@/components/ui/loader';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';

interface SavedPost {
  id: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    isVerified?: boolean;
  };
  content: string;
  images?: string[];
  mediaTypes?: string[];
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: string;
  location?: string;
}

export default function SavedPage() {
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  async function loadSavedPosts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: saved } = await supabase
      .from('saved_posts')
      .select('post_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!saved || saved.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const postIds = saved.map(s => s.post_id);

    const { data: dbPosts } = await supabase
      .from('posts')
      .select('id, user_id, content, location, created_at, hide_likes, disable_comments, post_media(id, storage_path, media_type, sort_order)')
      .in('id', postIds)
      .is('deleted_at', null);

    if (!dbPosts) { setLoading(false); return; }

    const orderedPosts = postIds.map(id => dbPosts.find((p: any) => p.id === id)).filter(Boolean) as any[];

    const [likesRes, commentsRes, likedRes] = await Promise.all([
      supabase.from('post_likes').select('post_id').in('post_id', postIds),
      supabase.from('comments').select('post_id').in('post_id', postIds).is('deleted_at', null),
      supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds),
    ]);

    const likeCountMap = new Map<string, number>();
    likesRes.data?.forEach(l => likeCountMap.set(l.post_id, (likeCountMap.get(l.post_id) || 0) + 1));
    const commentCounts = new Map<string, number>();
    commentsRes.data?.forEach(c => commentCounts.set(c.post_id, (commentCounts.get(c.post_id) || 0) + 1));
    const likedSet = new Set(likedRes.data?.map(l => l.post_id) || []);

    setPosts(orderedPosts.map((p: any) => {
      const media = (p.post_media || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
      return {
        id: p.id,
        user: { id: p.user_id, username: '', displayName: '', avatar: '', isVerified: false, bio: '', followers: 0, following: 0, posts: 0 },
        content: p.content || '',
        images: media.map((m: any) => m.storage_path),
        mediaTypes: media.map((m: any) => m.media_type),
        likes: likeCountMap.get(p.id) || 0,
        comments: commentCounts.get(p.id) || 0,
        shares: 0,
        isLiked: likedSet.has(p.id),
        isSaved: true,
        createdAt: p.created_at,
        location: p.location || undefined,
        hideLikes: p.hide_likes ?? false,
        disableComments: p.disable_comments ?? false,
      };
    }));
    setLoading(false);
  }

  useEffect(() => {
    loadSavedPosts();
  }, []);

  const handleRefresh = async () => {
    await loadSavedPosts();
  };

  return (
    <MainLayout>
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen">
        <div className="sticky top-0 z-10 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 py-3">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Saved</h1>
        </div>

        {loading ? (
          <PageLoader />
        ) : posts.length > 0 ? (
          <div className="divide-y divide-[var(--border-subtle)]">
            {posts.map((post) => (
              <div key={post.id} className="p-3">
                <PostCard post={post} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No saved posts</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-xs">
              Bookmark posts to save them here. Your saved items will appear here.
            </p>
          </div>
        )}
      </div>
      </PullToRefresh>
    </MainLayout>
  );
}