'use client';

import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const categories = ['All', 'Photos', 'Videos', 'Reels', 'Text'];

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
}

interface PostWithDetails {
  id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  user_username: string;
  user_display_name: string;
  user_avatar_url: string | null;
  like_count: number;
  comment_count: number;
  images: string[];
}

export default function ExplorePage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [posts, setPosts] = useState<PostWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Search users
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      setSearching(true);
      setShowResults(true);

      // Strip leading @ if present
      const query = searchQuery.replace(/^@/, '').trim();

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);

      if (!error && profiles) {
        setSearchResults(profiles as Profile[]);
      } else {
        setSearchResults([]);
      }

      setSearching(false);
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchQuery, supabase]);

  // Close search results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    async function loadPosts() {
      const { data: { user } } = await supabase.auth.getUser();

      // Use RPC with proper args
      const rpcResult = await supabase.rpc('get_explore_posts', {
        p_user_id: user?.id ?? null,
        p_limit: 20,
        p_cursor: null
      });

      const explorePosts = rpcResult.data as PostWithDetails[];
      const postsError = rpcResult.error;

      console.log('[EXPLORE] Posts query result:', { count: explorePosts?.length, postsError });
      console.log('[EXPLORE] Sample posts:', explorePosts?.slice(0, 2));

      if (explorePosts && explorePosts.length > 0) {
        // Get media from post_media table
        const postIds = explorePosts.map((p: PostWithDetails) => String(p.id));
        console.log('[EXPLORE] postIds:', postIds);

        // Debug: first try fetching ALL post_media to see if any exists
        const { data: allMedia, error: mediaError } = await supabase
          .from('post_media')
          .select('post_id, storage_path, sort_order')
          .limit(5);

        console.log('[EXPLORE] ALL MEDIA (first 5):', allMedia, mediaError);

        // Simple unfiltered query to test if data exists
        const { data: media, error: mediaError2 } = await supabase
          .from('post_media')
          .select('post_id, storage_path, sort_order');

        console.log('[EXPLORE] UNFILTERED MEDIA:', media, mediaError2);

        // Build media map - first image per post (SAME AS PROFILE)
        const mediaMap = new Map<string, string>();
        media?.forEach(m => {
          if (!mediaMap.has(m.post_id)) {
            mediaMap.set(m.post_id, m.storage_path);
          }
        });

        console.log('[EXPLORE] MEDIA MAP:', Array.from(mediaMap.entries()));

        // Merge images into posts (SAME AS PROFILE)
        const postsWithMedia = explorePosts.map((p: PostWithDetails) => ({
          id: p.id,
          user_id: p.user_id,
          content: p.content,
          created_at: p.created_at,
          user_username: p.user_username,
          user_display_name: p.user_display_name,
          user_avatar_url: p.user_avatar_url,
          like_count: p.like_count,
          comment_count: p.comment_count,
          images: mediaMap.get(String(p.id)) ? [mediaMap.get(String(p.id))!] : []
        }));

        console.log('[EXPLORE] FINAL POSTS OBJECT:', postsWithMedia.slice(0, 2));
        console.log('[EXPLORE] FIRST POST:', postsWithMedia[0]);
        console.log('[EXPLORE] FIRST POST IMAGES:', postsWithMedia[0]?.images);

        setPosts(postsWithMedia);
      }

      setLoading(false);
    }

    loadPosts();
  }, []);

  return (
    <MainLayout>
      <div className="min-h-screen">
        {/* Search Header */}
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-xl border-b border-[var(--border-subtle)] p-4">
          <div className="relative max-w-xl mx-auto" ref={searchRef}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.trim().length >= 2 && setShowResults(true)}
              className="w-full pl-11 pr-4 py-2.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-soft)]"
            />

            {/* Search Results Dropdown */}
            {showResults && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-xl z-50">
                {searching ? (
                  <div className="p-4 text-center text-[var(--text-muted)]">Searching...</div>
                ) : searchResults.length > 0 ? (
                  <div className="max-h-80 overflow-y-auto">
                    {searchResults.map((profile) => (
                      <Link
                        key={profile.id}
                        href={`/profile/${profile.username}`}
                        className="flex items-center gap-3 p-3 hover:bg-[var(--bg-tertiary)] transition-colors-fast"
                        onClick={() => setShowResults(false)}
                      >
                        <Avatar
                          src={profile.avatar_url}
                          name={profile.display_name}
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white truncate">@{profile.username}</p>
                          <p className="text-sm text-[var(--text-muted)] truncate">
                            {profile.display_name}
                            {profile.bio && ` · ${profile.bio}`}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : searchQuery.trim().length >= 2 ? (
                  <div className="p-4 text-center text-[var(--text-muted)]">No users found</div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Categories */}
        <div className="border-b border-[var(--border-subtle)] px-4 py-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors-fast',
                  activeCategory === cat
                    ? 'bg-white text-black'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Discover Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[var(--text-muted)]">Loading...</div>
          </div>
        ) : posts.length > 0 ? (
          <div className="p-1">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] px-3 py-3">Discover</h2>
            <div className="grid grid-cols-3 gap-0.5">
              {posts.map((post, index) => (
                <div
                  key={post.id}
                  className="aspect-square bg-[var(--bg-secondary)] relative group"
                >
                  {post.images?.[0] ? (
                    <img
                      src={post.images[0]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : post.content ? (
                    <div className="p-4 bg-[var(--bg-secondary)] rounded-lg" style={{ minHeight: '100px' }}>
                      <p className="text-sm text-[var(--text-secondary)] line-clamp-3">{post.content}</p>
                    </div>
                  ) : (
                    <div className="p-4 bg-[var(--bg-secondary)] rounded-lg" style={{ minHeight: '100px' }} />
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                    <div className="flex items-center gap-4 text-white text-sm">
                      <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                        </svg>
                        {formatNumber(post.like_count || 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        {formatNumber(post.comment_count || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-[var(--text-muted)]">No posts to explore yet</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}