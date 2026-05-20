'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { GridSkeleton } from '@/components/design-system/skeleton';
import { usePullToRefresh, useScrollPreservation } from '@/lib/hooks/use-pull-to-refresh';
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
  mediaTypes: string[];
}

export default function ExplorePage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [posts, setPosts] = useState<PostWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Filter posts by active category
  const filteredPosts = activeCategory === 'All' ? posts : posts.filter(post => {
    const hasVideo = post.mediaTypes?.some(t => t === 'video');
    const hasImage = post.mediaTypes?.some(t => t === 'image');
    const isText = post.images.length === 0;
    switch (activeCategory) {
      case 'Photos': return hasImage && !hasVideo;
      case 'Videos': return hasVideo;
      case 'Reels': return hasVideo && post.images.length === 1;
      case 'Text': return isText;
      default: return true;
    }
  });

  // Scroll preservation
  useScrollPreservation({ key: 'explore' });

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: freshPosts } = await supabase.rpc('get_explore_feed', {
      p_user_id: user?.id ?? null,
      p_limit: 30,
      p_cursor: null,
    });
    if (freshPosts && freshPosts.length > 0) {
      const formatted = freshPosts.map((p: any) => ({
        id: p.id, user_id: p.user_id, content: p.content, created_at: p.created_at,
        user_username: p.username, user_display_name: p.display_name, user_avatar_url: p.avatar_url,
        like_count: p.like_count, comment_count: p.comment_count,
        images: (p.media || []).map((m: any) => m.storage_path),
        mediaTypes: (p.media || []).map((m: any) => m.media_type || 'image'),
      }));
      setPosts(formatted);
      if (formatted.length > 0) setCursor(formatted[formatted.length - 1].created_at);
      setHasMore(formatted.length >= 30);
    }
  }, []);

  const { pullDistance, isRefreshing, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

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

      const { data: explorePosts } = await supabase.rpc('get_explore_feed', {
        p_user_id: user?.id ?? null,
        p_limit: 30,
        p_cursor: null,
      });

      if (explorePosts && explorePosts.length > 0) {
        const formatted = explorePosts.map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          content: p.content,
          created_at: p.created_at,
          user_username: p.username,
          user_display_name: p.display_name,
          user_avatar_url: p.avatar_url,
          like_count: p.like_count,
          comment_count: p.comment_count,
          images: (p.media || []).map((m: any) => m.storage_path),
          mediaTypes: (p.media || []).map((m: any) => m.media_type || 'image'),
        }));
        setPosts(formatted);
        if (formatted.length > 0) {
          setCursor(formatted[formatted.length - 1].created_at);
        }
        if (formatted.length < 30) setHasMore(false);
      }

      setLoading(false);
    }

    loadPosts();
  }, []);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading || !cursor) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        setLoadingMore(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { data: morePosts } = await supabase.rpc('get_explore_feed', {
          p_user_id: user?.id ?? null,
          p_limit: 30,
          p_cursor: cursor,
        });

        if (morePosts && morePosts.length > 0) {
          const formatted = morePosts.map((p: any) => ({
            id: p.id, user_id: p.user_id, content: p.content, created_at: p.created_at,
            user_username: p.username, user_display_name: p.display_name, user_avatar_url: p.avatar_url,
            like_count: p.like_count, comment_count: p.comment_count,
            images: (p.media || []).map((m: any) => m.storage_path),
            mediaTypes: (p.media || []).map((m: any) => m.media_type || 'image'),
          }));
          setPosts(prev => [...prev, ...formatted]);
          if (formatted.length > 0) setCursor(formatted[formatted.length - 1].created_at);
          if (formatted.length < 30) setHasMore(false);
        } else {
          setHasMore(false);
        }
        setLoadingMore(false);
      }
    }, { rootMargin: '200px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, hasMore, loading, loadingMore]);

  return (
    <MainLayout>
      <div className="min-h-screen" {...pullHandlers} style={{ transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined, transition: pullDistance === 0 ? 'transform 0.3s ease' : undefined }}>
        {/* Pull-to-refresh indicator */}
        {pullDistance > 0 && (
          <div className="flex items-center justify-center py-3 text-sm text-[var(--text-muted)]" style={{ marginTop: -pullDistance }}>
            {isRefreshing ? 'Refreshing...' : pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        )}
        {/* Search Header */}
        <div className="sticky top-0 z-10 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)] p-4">
          <div className="relative max-w-xl mx-auto" ref={searchRef}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <label htmlFor="explore-search" className="sr-only">Search users</label>
            <input
              id="explore-search"
              type="text"
              placeholder="Search"
              aria-label="Search users"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.trim().length >= 2 && setShowResults(true)}
              className="w-full pl-11 pr-4 py-2.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-soft)]"
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
                          <p className="font-medium text-[var(--text-primary)] truncate">@{profile.username}</p>
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
          <div role="tablist" aria-label="Content categories" className="flex gap-2 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                role="tab"
                aria-selected={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors-fast',
                  activeCategory === cat
                    ? 'bg-[var(--text-primary)] text-[var(--text-inverse)]'
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
          <div className="p-1">
            <GridSkeleton columns={5} rows={3} />
          </div>
        ) : filteredPosts.length > 0 ? (
          <div className="p-1">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] px-3 py-3">Discover</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0.5">
              {filteredPosts.map((post, index) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="aspect-square bg-[var(--bg-secondary)] relative group block focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-inset cursor-pointer"
                >
                  {post.images?.[0] ? (
                    post.mediaTypes?.[0] === 'video' ? (
                      <div className="relative w-full h-full">
                        <video
                          src={post.images[0]}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                        <div className="absolute top-2 right-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={post.images[0]}
                        alt={`Post by ${post.user_display_name}`}
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : post.content ? (
                    <div className="p-4 bg-[var(--bg-secondary)] rounded-lg" style={{ minHeight: '100px' }}>
                      <p className="text-sm text-[var(--text-secondary)] line-clamp-3">{post.content}</p>
                    </div>
                  ) : (
                    <div className="p-4 bg-[var(--bg-secondary)] rounded-lg" style={{ minHeight: '100px' }} />
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3" aria-hidden="true">
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
                </Link>
              ))}
            </div>
            <div ref={sentinelRef} className="h-1" />
            {loadingMore && (
              <div className="py-8 flex justify-center">
                <div className="animate-spin h-5 w-5 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
              </div>
            )}
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