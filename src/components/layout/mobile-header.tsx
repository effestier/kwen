'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/brand/config';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export function MobileHeader({ initialProfile }: { initialProfile?: Profile | null }) {
  const [notificationCount, setNotificationCount] = useState(0);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const userIdRef = useRef<string | null>(initialProfile?.id ?? null);

  useEffect(() => {
    if (!initialProfile) {
      async function loadUser() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userIdRef.current = user.id;
          loadNotifCount(user.id);
        }
      }
      loadUser();
    } else {
      userIdRef.current = initialProfile.id;
      loadNotifCount(initialProfile.id);
    }

    async function loadNotifCount(uid: string) {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('is_read', false);
      setNotificationCount(count || 0);
    }

    // Realtime: new notifications
    const channel = supabase
      .channel('mobile-header-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new && (payload.new as any).user_id === userIdRef.current) {
          setNotificationCount(prev => prev + 1);
        }
      })
      .subscribe();

    // Listen for notifications-read event
    function handleNotificationsRead() {
      setNotificationCount(0);
    }
    window.addEventListener('notifications-read', handleNotificationsRead);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('notifications-read', handleNotificationsRead);
    };
  }, [initialProfile]);

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-12 flex items-center justify-between px-4 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]/30" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Logo */}
      <Link href="/feed" className="flex items-center">
        <span className="text-lg font-bold text-[var(--text-primary)] tracking-tight">{BRAND.name}</span>
      </Link>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="relative p-2 rounded-full hover:bg-[var(--bg-secondary)] transition-colors active:scale-90"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--text-primary)]">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent-red)] text-white text-[9px] font-bold flex items-center justify-center count-pulse">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </Link>

        {/* Create */}
        <Link
          href="/create"
          aria-label="Create post"
          className="p-2 rounded-full hover:bg-[var(--bg-secondary)] transition-colors active:scale-90"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--text-primary)]">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" x2="12" y1="8" y2="16" />
            <line x1="8" x2="16" y1="12" y2="12" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
