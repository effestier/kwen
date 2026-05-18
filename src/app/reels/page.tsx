'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';

interface Reel {
  id: string;
  video_url: string;
  caption: string;
  user_id: string;
  created_at: string;
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
      // Get posts that have video media from post_media table
      const { data: mediaPosts, error } = await supabase
        .from('post_media')
        .select(`
          id,
          storage_path,
          media_type,
          post:posts!inner(
            id,
            content,
            user_id,
            created_at
          )
        `)
        .eq('media_type', 'video')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error || !mediaPosts) {
        setLoading(false);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(mediaPosts.map((m: any) => m.post?.user_id).filter(Boolean))];

      // Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      const reelsData: Reel[] = mediaPosts
        .filter((m: any) => m.post)
        .map((m: any) => {
          const profile = profileMap.get(m.post.user_id);
          return {
            id: m.post.id,
            video_url: m.storage_path,
            caption: m.post.content || '',
            user_id: m.post.user_id,
            created_at: m.post.created_at,
            user: {
              username: profile?.username || 'user',
              display_name: profile?.display_name || 'User',
              avatar_url: profile?.avatar_url || null,
            },
          };
        });

      setReels(reelsData);
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
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-8 w-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
        </div>
      </MainLayout>
    );
  }

  if (reels.length === 0) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen text-[var(--text-secondary)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 text-[var(--text-muted)]">
            <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
          </svg>
          <p className="text-lg font-medium">No reels yet</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Video posts will appear here</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="fixed inset-0 top-[60px] lg:top-0 lg:left-[72px] xl:left-[245px] bg-black overflow-y-auto snap-y snap-mandatory" onScroll={handleScroll}>
        <div className="h-full">
          {reels.map((reel) => (
            <div
              key={reel.id}
              className="h-[calc(100vh-60px)] lg:h-screen flex items-center justify-center relative snap-start"
            >
              {/* Video */}
              <div className="absolute inset-0 bg-[var(--bg-tertiary)] flex items-center justify-center">
                <video
                  src={reel.video_url}
                  className="w-full h-full object-contain"
                  loop
                  muted
                  playsInline
                  onError={(e) => {
                    // Fallback for broken videos
                    const target = e.target as HTMLVideoElement;
                    target.style.display = 'none';
                  }}
                />
              </div>

              {/* Side actions */}
              <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
                <button className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                  </div>
                </button>
                <button className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                </button>
                <button className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" />
                    </svg>
                  </div>
                </button>
              </div>

              {/* Bottom info */}
              <div className="absolute bottom-4 left-3 right-16 z-10">
                <div className="flex items-center gap-2 mb-2">
                  <Avatar
                    src={reel.user.avatar_url}
                    name={reel.user.display_name}
                    size="sm"
                  />
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
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 flex gap-1 z-10">
          {reels.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-white w-3' : 'bg-white/50'}`}
            />
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
