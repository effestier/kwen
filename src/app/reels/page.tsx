'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Reel {
  id: string;
  video_url: string;
  caption: string;
  user_id: string;
  created_at: string;
  likes_count: number;
  comments_count: number;
  user: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export default function ReelsPage() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    async function loadReels() {
      const { data, error } = await supabase
        .from('posts')
        .select('id, content, media_url, user_id, created_at')
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error loading reels:', error);
        setLoading(false);
        return;
      }

      // For now, filter for video content
      const videoPosts = (data || []).filter(p => p.media_url?.match(/\.(mp4|webm|mov)$/i));

      // Add mock user data for now (in production, join with profiles)
      const reelsWithUser = videoPosts.map(post => ({
        id: post.id,
        video_url: post.media_url,
        caption: post.content || '',
        user_id: post.user_id,
        created_at: post.created_at,
        likes_count: Math.floor(Math.random() * 1000),
        comments_count: Math.floor(Math.random() * 100),
        user: {
          username: 'user',
          display_name: 'User',
          avatar_url: null
        }
      }));

      setReels(reelsWithUser);
      setLoading(false);
    }

    loadReels();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const itemHeight = window.innerHeight - 80;
    const newIndex = Math.round(scrollTop / itemHeight);
    setCurrentIndex(Math.max(0, Math.min(newIndex, reels.length - 1)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
        <div className="animate-spin h-8 w-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-primary)] text-[var(--text-secondary)]">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 text-[var(--text-muted)]">
          <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
        </svg>
        <p className="text-lg font-medium">No reels yet</p>
        <p className="text-sm text-[var(--text-muted)] mt-1">Video posts will appear here</p>
      </div>
    );
  }

  return (
    <div className="lg:hidden fixed inset-0 top-[60px] bg-[var(--bg-primary)] overflow-y-auto" onScroll={handleScroll}>
      <div className="h-full">
        {reels.map((reel, index) => (
          <div
            key={reel.id}
            className="h-[calc(100vh-140px)] flex items-center justify-center relative"
          >
            {/* Video placeholder - in production would use <video> */}
            <div className="absolute inset-0 bg-[var(--bg-tertiary)] flex items-center justify-center">
              <div className="text-center p-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-[var(--text-muted)]">
                  <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                </svg>
                <p className="text-sm text-[var(--text-muted)]">Video: {reel.video_url}</p>
              </div>
            </div>

            {/* Side actions */}
            <div className="absolute right-4 flex flex-col items-center gap-6">
              <button className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </div>
                <span className="text-xs text-white font-medium">{reel.likes_count}</span>
              </button>
              <button className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <span className="text-xs text-white font-medium">{reel.comments_count}</span>
              </button>
              <button className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" />
                  </svg>
                </div>
              </button>
            </div>

            {/* Bottom info */}
            <div className="absolute bottom-4 left-4 right-16">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {reel.user.username?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <span className="text-white font-semibold text-sm">@{reel.user.username}</span>
              </div>
              {reel.caption && (
                <p className="text-white/90 text-sm line-clamp-2">{reel.caption}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Page indicator */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 flex gap-1">
        {reels.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-white w-3' : 'bg-white/50'}`}
          />
        ))}
      </div>
    </div>
  );
}