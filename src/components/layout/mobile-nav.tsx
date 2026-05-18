'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export function MobileNav() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (!data) {
        const tempUsername = `user_${user.id.slice(0, 8)}`;
        const { data: newProfile } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            username: tempUsername,
            display_name: user.email?.split('@')[0] || 'User',
          }, { onConflict: 'id' })
          .select('id, username, display_name, avatar_url')
          .single();
        data = newProfile;
      }

      if (data) setProfile(data);
    }

    async function loadMessageCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('unread_count')
        .eq('user_id', user.id);

      const total = participants?.reduce((sum, p) => sum + (p.unread_count || 0), 0) || 0;
      setMessageCount(total);
    }

    async function loadNotificationCount() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', authUser.id)
        .eq('is_read', false);

      setNotificationCount(count || 0);
    }

    loadProfile();
    loadMessageCount();
    loadNotificationCount();

    // Subscribe to new messages for realtime badge updates
    const channel = supabase
      .channel('mobile-messages-badge')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants' }, (payload) => {
        const updated = payload.new as { user_id: string; unread_count: number };
        if (updated.user_id === profile?.id) {
          loadMessageCount();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new && (payload.new as any).user_id === profile?.id) {
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
      window.removeEventListener('notifications-read', handleNotificationsRead);
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const isActive = (href: string) => {
    if (href === '/feed') return pathname === '/feed';
    if (href === '/profile') return pathname?.startsWith('/profile/');
    return pathname?.startsWith(href);
  };

  const profileHref = profile ? `/profile/${profile.username}` : '/feed';

  return (
    <nav aria-label="Mobile navigation" className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
      <div className="flex items-center justify-around h-16">
        {/* Home */}
        <Link href="/feed" className="flex flex-col items-center justify-center gap-0.5 w-full h-full" aria-label="Home" aria-current={isActive('/feed') ? 'page' : undefined}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive('/feed') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={isActive('/feed') ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
            <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
            <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <span className={`text-[10px] ${isActive('/feed') ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>Home</span>
        </Link>

        {/* Explore */}
        <Link href="/explore" className="flex flex-col items-center justify-center gap-0.5 w-full h-full" aria-label="Explore" aria-current={isActive('/explore') ? 'page' : undefined}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive('/explore') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={isActive('/explore') ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span className={`text-[10px] ${isActive('/explore') ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>Explore</span>
        </Link>

        {/* Messages */}
        <Link href="/messages" className="flex flex-col items-center justify-center gap-0.5 w-full h-full relative" aria-label="Messages" aria-current={isActive('/messages') ? 'page' : undefined}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive('/messages') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={isActive('/messages') ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {messageCount > 0 && (
            <span className="absolute top-1 right-1/2 translate-x-4 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent-primary)] text-white text-[9px] font-bold flex items-center justify-center">
              {messageCount > 99 ? '99+' : messageCount}
            </span>
          )}
          <span className={`text-[10px] ${isActive('/messages') ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>Messages</span>
        </Link>

        {/* Reels */}
        <Link href="/reels" className="flex flex-col items-center justify-center gap-0.5 w-full h-full" aria-label="Reels" aria-current={isActive('/reels') ? 'page' : undefined}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive('/reels') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={isActive('/reels') ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span className={`text-[10px] ${isActive('/reels') ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>Reels</span>
        </Link>

        {/* Profile */}
        <Link href={profileHref} className="flex flex-col items-center justify-center gap-0.5 w-full h-full" aria-label="Profile" aria-current={isActive('/profile') ? 'page' : undefined}>
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              className={`w-6 h-6 rounded-full object-cover ${isActive('/profile') ? 'ring-2 ring-[var(--text-primary)]' : ''}`}
            />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive('/profile') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={isActive('/profile') ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
              <circle cx="12" cy="8" r="5" />
              <path d="M20 21a8 8 0 1 0-16 0" />
            </svg>
          )}
          <span className={`text-[10px] ${isActive('/profile') ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>Profile</span>
        </Link>
      </div>
    </nav>
  );
}
