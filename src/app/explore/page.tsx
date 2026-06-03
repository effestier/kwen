'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils';
import { PaginationLoader } from '@/components/ui/loader';
import { GridSkeleton } from '@/components/design-system/skeleton';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useScrollPreservation } from '@/lib/hooks/use-pull-to-refresh';
import { TrendingTags } from '@/components/explore/trending-tags';
import { SuggestedUsers } from '@/components/explore/suggested-users';
import Link from 'next/link';

const categories = ['All', 'Photos', 'Videos', 'Text'] as const;
type Category = typeof categories[number];
type SearchMode = 'users' | 'tags' | 'posts';

interface ExplorePost {
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
  media: Array<{ id: string; storage_path: string; media_type: string; sort_order: number }>;
}


interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  user_id?: string;
  like_count?: number;
  comment_count?: number;
  media?: Array<{ id: string; storage_path: string; media_type: string; sort_order: number }> | null;
  result_type?: string;
}

export default function ExplorePage() {
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('users');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useScrollPreservation({ key: 'explore' });

  // Server-side category filtering via RPC p_category param
  // No client-side filtering needed — RPC handles it

  // Load explore posts — uses exclude_ids for cursor-based pagination
  const loadPosts = useCallback(async (excludeIds: string[], category: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: explorePosts, error: rpcError } = await supabase.rpc('get_explore_feed', {
      p_user_id: user?.id ?? '00000000-0000-0000-0000-000000000000',
      p_limit: 30,
      p_exclude_ids: excludeIds,
    });
    if (rpcError) {
      console.error('[EXPLORE] get_explore_feed RPC error:', rpcError.message, rpcError);
      return [];
    }
    const posts = (explorePosts || []) as ExplorePost[];
    // Client-side category filtering (DB RPC doesn't support p_category yet)
    if (category !== 'All') {
      const cat = category.toLowerCase();
      return posts.filter(p => {
        const hasImage = p.media?.some(m => m.media_type === 'image');
        const hasVideo = p.media?.some(m => m.media_type === 'video');
        const noMedia = !p.media || p.media.length === 0;
        if (cat === 'photos') return hasImage && !hasVideo;
        if (cat === 'videos') return hasVideo;
        if (cat === 'reels') return hasVideo && p.media?.length === 1;
        if (cat === 'text') return noMedia;
        return true;
      });
    }
    return posts;
  }, [supabase]);

  const updateSeenIds = useCallback((newPosts: ExplorePost[]) => {
    if (newPosts.length > 0) {
      setSeenIds(prev => [...prev, ...newPosts.map(p => p.id)]);
    }
  }, []);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    const freshPosts = await loadPosts([], activeCategory);
    setPosts(freshPosts);
    setSeenIds(freshPosts.map(p => p.id));
    setHasMore(freshPosts.length >= 30);
  }, [loadPosts, activeCategory]);


  // Initial load
  useEffect(() => {
    async function init() {
      setLoading(true);
      const initialPosts = await loadPosts([], activeCategory);
      // Initial posts loaded: initialPosts.length
      setPosts(initialPosts);
      setSeenIds(initialPosts.map(p => p.id));
      if (initialPosts.length < 30) setHasMore(false);
      else setHasMore(true);
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading || seenIds.length === 0) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !loadingMoreRef.current) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
        try {
          const morePosts = await loadPosts(seenIds, activeCategory);
          setPosts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = morePosts.filter(p => !existingIds.has(p.id));
            return [...prev, ...newPosts];
          });
          updateSeenIds(morePosts);
          if (morePosts.length < 30) setHasMore(false);
        } finally {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    }, { rootMargin: '400px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [seenIds, hasMore, loading, loadPosts, updateSeenIds, activeCategory]);

  // Search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setShowResults(true);
      const { data: { user } } = await supabase.auth.getUser();
      const query = searchQuery.startsWith('@') ? searchQuery.slice(1) : searchQuery;

      if (searchMode === 'users') {
        const { data, error: searchError } = await supabase.rpc('search_explore', {
          p_user_id: user?.id ?? '00000000-0000-0000-0000-000000000000',
          p_query: query,
          p_type: 'users',
          p_limit: 10,
        });
        if (searchError) {
          console.error('[EXPLORE] search_explore users error:', searchError.message);
          setSearchResults([]);
          setSearching(false);
          return;
        }
        setSearchResults(((data || []) as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          username: String(r.username),
          display_name: String(r.display_name || r.username),
          avatar_url: (r.avatar_url as string | null) ?? null,
          bio: null as string | null,
          is_verified: Boolean(r.is_verified),
        })));
      } else {
        const { data, error: searchError } = await supabase.rpc('search_explore', {
          p_user_id: user?.id ?? '00000000-0000-0000-0000-000000000000',
          p_query: query.startsWith('#') ? query.slice(1) : query,
          p_type: searchMode,
          p_limit: 20,
        });
        if (searchError) {
          console.error('[EXPLORE] search_explore', searchMode, 'error:', searchError.message);
          setSearchResults([]);
          setSearching(false);
          return;
        }
        if (searchMode === 'tags' && data) {
          setSearchResults((data as Array<Record<string, unknown>>).map((r) => ({
            id: String(r.hashtag || r.id),
            username: String(r.hashtag),
            display_name: `#${r.hashtag}`,
            avatar_url: null,
            bio: `${formatNumber(Number(r.post_count || 0))} posts`,
            is_verified: false,
          })));
        } else if (searchMode === 'posts' && data) {
          setSearchResults((data as Array<Record<string, unknown>>).map((r) => ({
            id: String(r.id),
            user_id: String(r.user_id),
            username: String(r.username),
            display_name: String(r.display_name || r.username),
            avatar_url: (r.avatar_url as string | null) ?? null,
            bio: r.content ? (String(r.content).length > 80 ? String(r.content).slice(0, 80) + '...' : String(r.content)) : null,
            is_verified: Boolean(r.is_verified),
            like_count: Number(r.like_count) || 0,
            comment_count: Number(r.comment_count) || 0,
            media: (r.media as ExplorePost['media']) || null,
            result_type: String(r.result_type || 'post'),
          })));
        } else {
          setSearchResults([]);
        }
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchMode, supabase]);

  // H32: Close search results on click outside — check both mobile and desktop refs
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inMobile = mobileSearchRef.current?.contains(target);
      const inDesktop = searchRef.current?.contains(target);
      if (!inMobile && !inDesktop) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Grid class for mixed aspect ratios
  // All tiles are equal size — no mosaic layout

  if (loading) {
    return (
      <MainLayout>
        <div className="p-0.5">
          <GridSkeleton columns={3} rows={6} gap={0.5} />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen">

        {/* Mobile Header */}
        <div className="lg:hidden sticky top-12 z-20 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)]">
          <h1 className="heading-page">Explore</h1>

          {/* Search bar */}
          <div ref={mobileSearchRef} className="relative">
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users, tags, posts..."
                className="w-full pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
              />
            </div>

            {/* Search mode tabs */}
            {searchQuery.length > 0 && (
              <div className="flex gap-2 mt-2">
                {(['users', 'tags', 'posts'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setSearchMode(mode)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors-fast ${
                      searchMode === mode
                        ? 'bg-[var(--text-primary)] text-[var(--text-inverse)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                    }`}
                  >
                    {mode === 'tags' ? 'Hashtags' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {/* Search results dropdown */}
            {showResults && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg max-h-72 overflow-y-auto z-30">
                {searching ? (
                  <div className="p-4 text-center text-sm text-[var(--text-muted)]">Searching...</div>
                ) : searchMode === 'users' && searchResults.length > 0 ? (
                  searchResults.map((result) => (
                    <Link
                      key={result.id}
                      href={`/profile/${result.username}`}
                      onClick={() => setShowResults(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors-fast"
                    >
                      <Avatar src={result.avatar_url} name={result.display_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{result.display_name}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">@{result.username}</p>
                      </div>
                    </Link>
                  ))
                ) : searchMode === 'tags' && searchResults.length > 0 ? (
                  searchResults.map((tag) => (
                    <Link
                      key={tag.id}
                      href={`/explore/tags/${tag.username}`}
                      onClick={() => setShowResults(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors-fast"
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-xs font-bold text-[var(--text-primary)]">#</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">#{tag.username}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{tag.bio}</p>
                      </div>
                    </Link>
                  ))
                ) : searchMode === 'posts' && searchResults.length > 0 ? (
                  searchResults.map((result) => (
                    <Link
                      key={result.id}
                      href={`/post/${result.id}`}
                      onClick={() => setShowResults(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors-fast"
                    >
                      <Avatar src={result.avatar_url} name={result.display_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{result.display_name}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{result.bio}</p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-[var(--text-muted)]">No results found</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:block sticky top-0 z-20 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
          <div className="max-w-5xl mx-auto flex items-center gap-4 px-4 py-3">
            <h1 className="heading-page">Explore</h1>
            <div ref={searchRef} className="flex-1 max-w-md relative">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users, tags, posts..."
                  className="w-full pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
                />
              </div>
              {showResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg max-h-72 overflow-y-auto z-30">
                  {searching ? (
                    <div className="p-4 text-center text-sm text-[var(--text-muted)]">Searching...</div>
                  ) : searchMode === 'users' && searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <Link
                        key={result.id}
                        href={`/profile/${result.username}`}
                        onClick={() => setShowResults(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors-fast"
                      >
                        <Avatar src={result.avatar_url} name={result.display_name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{result.display_name}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">@{result.username}</p>
                        </div>
                      </Link>
                    ))
                  ) : searchMode === 'tags' && searchResults.length > 0 ? (
                    searchResults.map((tag) => (
                      <Link
                        key={tag.id}
                        href={`/explore/tags/${tag.username}`}
                        onClick={() => setShowResults(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors-fast"
                      >
                        <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-xs font-bold text-[var(--text-primary)]">#</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">#{tag.username}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">{tag.bio}</p>
                        </div>
                      </Link>
                    ))
                  ) : searchMode === 'posts' && searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <Link
                        key={result.id}
                        href={`/post/${result.id}`}
                        onClick={() => setShowResults(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors-fast"
                      >
                        <Avatar src={result.avatar_url} name={result.display_name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{result.display_name}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">{result.bio}</p>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-[var(--text-muted)]">No results found</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trending Tags */}
        <div className="max-w-5xl mx-auto">
          <TrendingTags />
        </div>

        {/* Suggested Users */}
        <div className="max-w-5xl mx-auto">
          <SuggestedUsers />
        </div>

        {/* Category tabs */}
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-[var(--text-primary)] text-[var(--text-inverse)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Posts grid */}
        <div className="max-w-5xl mx-auto px-0.5">
          {posts.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-0.5">
              {posts.map((post) => {
                const hasImage = post.media?.some(m => m.media_type === 'image');
                const hasVideo = post.media?.some(m => m.media_type === 'video');
                const hasMultiple = (post.media?.length || 0) > 1;

                return (
                  <Link
                    key={post.id}
                    href={`/post/${post.id}`}
                    className="relative group block overflow-hidden bg-[var(--bg-tertiary)] aspect-[4/5]"
                  >
                    {post.media && post.media.length > 0 ? (
                      hasVideo ? (
                        <div className="relative w-full h-full">
                          <video
                            src={post.media.find(m => m.media_type === 'video')?.storage_path}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                          <div className="absolute top-2 right-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-md">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={post.media[0].storage_path}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-3 bg-[var(--bg-secondary)]">
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-3 text-center">{post.content}</p>
                      </div>
                    )}

                    {/* Multi-media indicator */}
                    {hasMultiple && (
                      <div className="absolute top-2 right-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-md">
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><rect width="12" height="12" x="8" y="8" rx="1" ry="1" />
                        </svg>
                      </div>
                    )}

                    {/* Hover overlay (desktop) */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="flex items-center gap-4 text-white text-sm font-semibold">
                        <span className="flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                          </svg>
                          {formatNumber(post.like_count)}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          {formatNumber(post.comment_count)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <p className="text-[var(--text-primary)] font-medium mb-1">No posts found</p>
              <p className="text-sm text-[var(--text-muted)]">Try a different search term.</p>
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && <PaginationLoader />}
        </div>
      </div>
      </PullToRefresh>
    </MainLayout>
  );
}
