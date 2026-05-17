'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { PostCard } from '@/components/post/post-card';
import { createClient } from '@/lib/supabase/client';
import { Post } from '@/types';

export default function SavedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadSavedPosts() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Get saved posts
      const { data: saved } = await supabase
        .from('saved_posts')
        .select('post_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!saved || saved.length === 0) {
        setLoading(false);
        return;
      }

      const postIds = saved.map(s => s.post_id);

      // Get posts
      const { data: dbPosts } = await supabase
        .from('posts')
        .select('id, user_id, content, location, created_at')
        .in('id', postIds)
        .is('deleted_at', null);

      if (!dbPosts) {
        setLoading(false);
        return;
      }

      // Get user info and counts
      const userIds = [...new Set(dbPosts.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .in('post_id', postIds)
        .eq('user_id', user.id);

      const likedSet = new Set(likes?.map(l => l.post_id) || []);

      const { data: comments } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds);

      const commentCounts = new Map<string, number>();
      comments?.forEach(c => {
        commentCounts.set(c.post_id, (commentCounts.get(c.post_id) || 0) + 1);
      });

      const { data: likeCounts } = await supabase
        .from('post_likes')
        .select('post_id')
        .in('post_id', postIds);

      const likeCountMap = new Map<string, number>();
      likeCounts?.forEach(l => {
        likeCountMap.set(l.post_id, (likeCountMap.get(l.post_id) || 0) + 1);
      });

      setPosts(dbPosts.map(p => {
        const profile = profileMap.get(p.user_id);
        return {
          id: p.id,
          user: {
            id: p.user_id,
            username: profile?.username || '',
            displayName: profile?.display_name || '',
            avatar: profile?.avatar_url || null,
            isVerified: profile?.is_verified || false,
            bio: '',
            followers: 0,
            following: 0,
            posts: 0,
          },
          content: p.content || '',
          images: [],
          likes: likeCountMap.get(p.id) || 0,
          comments: commentCounts.get(p.id) || 0,
          shares: 0,
          isLiked: likedSet.has(p.id),
          isSaved: true,
          createdAt: p.created_at,
          location: p.location || undefined,
        };
      }));

      setLoading(false);
    }

    loadSavedPosts();
  }, []);

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="sticky top-0 z-10 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)] p-4">
          <h1 className="text-xl font-bold text-white">Saved</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[var(--text-muted)]">Loading...</div>
          </div>
        ) : posts.length > 0 ? (
          <div className="divide-y divide-[var(--border-subtle)]">
            {posts.map((post) => (
              <div key={post.id} className="p-4">
                <PostCard post={post} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">No saved posts</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-xs">
              Bookmark posts to save them here. Your saved items will appear here.
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}