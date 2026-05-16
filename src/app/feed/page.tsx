'use client';

import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Stories } from '@/components/story/stories';
import { PostCard } from '@/components/post/post-card';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface PostWithDetails {
  id: string;
  user_id: string;
  content: string | null;
  location: string | null;
  created_at: string;
  user_display_name: string;
  user_username: string;
  user_avatar_url: string | null;
  user_is_verified: boolean;
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_saved: boolean;
  media?: Array<{
    id: string;
    storage_path: string;
    media_type: string;
    sort_order: number;
  }>;
}

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  expires_at: string;
  created_at: string;
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
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
  const [posts, setPosts] = useState<PostWithDetails[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        setLoading(false);
        return;
      }

      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', authUser.id)
        .single();

      setUser(profile);

      // Get feed posts using RPC
      const { data: feedPosts } = await supabase.rpc('get_timeline', {
        p_user_id: authUser.id,
        p_limit: 20,
        p_cursor: null,
      });

      console.log('[FEED] Posts result:', { count: feedPosts?.length });
      console.log('[FEED] Sample post:', feedPosts?.[0]);

      // Get media from post_media table
      if (feedPosts && feedPosts.length > 0) {
        const postIds = feedPosts.map((p: any) => p.id);
        const { data: media } = await supabase
          .from('post_media')
          .select('id, post_id, storage_path, media_type, sort_order')
          .in('post_id', postIds)
          .order('sort_order', { ascending: true });

        const mediaMap = new Map<string, any[]>();
        media?.forEach(m => {
          const existing = mediaMap.get(m.post_id) || [];
          mediaMap.set(m.post_id, [...existing, m]);
        });

        const postsWithMedia = feedPosts.map((p: any) => ({
          ...p,
          media: mediaMap.get(p.id) || []
        }));
        setPosts(postsWithMedia);
      } else {
        setPosts(feedPosts || []);
      }

      // Get stories from current user and followed users
      // First get IDs of users we follow
      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', authUser.id);

      const followingIds = following?.map(f => f.following_id) || [];
      // Include current user in the list
      const allUserIds = [authUser.id, ...followingIds];

      // Get non-expired stories from these users
      const { data: userStories } = await supabase
        .from('stories')
        .select(`
          id,
          user_id,
          media_url,
          media_type,
          expires_at,
          created_at,
          user:profiles!inner(id, username, display_name, avatar_url, is_verified)
        `)
        .in('user_id', allUserIds)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      // Get story views for current user
      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('user_id', authUser.id);

      const viewedSet = new Set(views?.map(v => v.story_id) || []);

      const formattedStories: Story[] = (userStories || []).map((s: any) => ({
        id: s.id,
        user_id: s.user_id,
        media_url: s.media_url,
        media_type: s.media_type || 'image',
        expires_at: s.expires_at,
        created_at: s.created_at,
        user: s.user,
        hasViewed: viewedSet.has(s.id),
      }));

      console.log('[FEED] Stories:', { count: formattedStories.length, stories: formattedStories.slice(0, 2) });

      setStories(formattedStories);
      setLoading(false);
    }

    loadData();
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('feed-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        // Refresh feed on new posts
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const { data: feedPosts } = await supabase.rpc('get_timeline', {
      p_user_id: authUser.id,
      p_limit: 20,
      p_cursor: null,
    });
    setPosts(feedPosts || []);
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-[var(--text-muted)]">Loading...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen">
        {/* Mobile Header */}
        <div className="lg:hidden sticky top-0 z-20 bg-black/90 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-white">Home</h1>
            <Link href="/notifications" className="p-2 rounded-full hover:bg-[var(--bg-secondary)] transition-colors-fast">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Desktop Header */}
          <div className="hidden lg:block sticky top-0 z-20 bg-black/80 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 py-3">
            <h1 className="text-xl font-bold text-white">Home</h1>
          </div>

          {/* Composer */}
          {user && (
            <div className="p-4 border-b border-[var(--border-subtle)]">
              <Link href="/create" className="flex items-start gap-3 group">
                <Avatar
                  src={user.avatar_url}
                  name={user.display_name}
                  size="md"
                />
                <div className="flex-1">
                  <div className="text-[15px] text-[var(--text-muted)] py-2.5 px-4 rounded-xl bg-[var(--bg-secondary)] border border-transparent group-hover:border-[var(--border-soft)] transition-colors-fast">
                    What's happening?
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-0.5">
                      {['image', 'gif', 'poll', 'emoji', 'location'].map((icon) => (
                        <button key={icon} className="p-2 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--accent-primary)] transition-colors-fast">
                          <ComposerIcon name={icon} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Stories */}
          {(stories.length > 0 || user) && (
            <div className="p-4 border-b border-[var(--border-subtle)]">
              <Stories
                stories={stories}
                currentUser={user ? {
                  id: user.id,
                  username: user.username,
                  display_name: user.display_name,
                  avatar_url: user.avatar_url,
                } : undefined}
                onUploadSuccess={() => {
                  // Reload stories after upload - add small delay to ensure DB commit
                  console.log('[FEED] onUploadSuccess triggered');
                  setTimeout(() => {
                    loadData();
                  }, 500);
                }}
              />
            </div>
          )}

          {/* Posts */}
          {posts.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {posts.map((post) => (
                <div key={post.id}>
                  <PostCard post={{
                    id: post.id,
                    user: {
                      id: post.user_id,
                      username: post.user_username,
                      displayName: post.user_display_name,
                      avatar: post.user_avatar_url || '',
                      isVerified: post.user_is_verified,
                      bio: '',
                      followers: 0,
                      following: 0,
                      posts: 0,
                    },
                    content: post.content || '',
                    images: post.media?.map(m => m.storage_path) || [],
                    likes: post.like_count,
                    comments: post.comment_count,
                    shares: 0,
                    isLiked: post.is_liked,
                    isSaved: post.is_saved,
                    createdAt: post.created_at,
                    location: post.location || undefined,
                  }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-[var(--text-muted)]">
              <p>No posts yet. Follow some users or create your first post!</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

function ComposerIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    image: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>,
    gif: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><text x="7" y="15" fontSize="7" fill="currentColor">GIF</text></svg>,
    poll: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>,
    emoji: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" /></svg>,
    location: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>,
  };
  return icons[name] || null;
}