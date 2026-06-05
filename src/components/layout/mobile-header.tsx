'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/brand/config';
import { usePathname } from 'next/navigation';

export function MobileHeader() {
  const [hasUnread, setHasUnread] = useState(false);
  const pathname = usePathname();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const showIcons = !['/explore', '/messages', '/videos'].includes(pathname || '');

  useEffect(() => {
    // Check localStorage for persisted state
    const stored = localStorage.getItem('kwen_notif_unread');
    if (stored === 'true') setHasUnread(true);

    // Realtime: new notifications (RLS ensures only user's own notifs arrive)
    const channel = supabase
      .channel('mobile-header-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        setHasUnread(true);
        localStorage.setItem('kwen_notif_unread', 'true');
      })
      .subscribe();

    function handleRead() {
      setHasUnread(false);
      localStorage.setItem('kwen_notif_unread', 'false');
    }
    window.addEventListener('notifications-read', handleRead);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('notifications-read', handleRead);
    };
  }, []);

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]/30" style={{ height: 'calc(48px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <Link href="/feed" className="flex items-center">
        <span className="text-lg font-bold text-[var(--text-primary)] tracking-tight">{BRAND.name}</span>
      </Link>

      {showIcons && (
      <div className="flex items-center gap-1">
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="relative p-2 rounded-full hover:bg-[var(--bg-secondary)] transition-colors active:scale-90"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--text-primary)]">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {hasUnread && (
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[var(--accent-red)]" />
          )}
        </Link>

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
    )}
    </header>
  );
}
