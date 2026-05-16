'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

// Mobile nav order: Profile, Explore, Messages, Reels, Home (left to right)
const navItems = [
  { href: '/profile/me', icon: 'profile', label: 'Profile' },
  { href: '/explore', icon: 'search', label: 'Explore' },
  { href: '/messages', icon: 'mail', label: 'Messages' },
  { href: '/reels', icon: 'video', label: 'Reels' },
  { href: '/feed', icon: 'home', label: 'Home' },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', user.id)
        .single();

      if (data) setProfile(data);
    }

    async function loadNotificationCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      setNotificationCount(count || 0);
    }

    loadProfile();
    loadNotificationCount();

    const channel = supabase
      .channel('mobile-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new && (payload.new as any).user_id === profile?.id) {
          setNotificationCount(prev => prev + 1);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Handle profile click - redirect to real username
  const handleProfileClick = (e: React.MouseEvent) => {
    if (profile?.username) {
      e.preventDefault();
      router.push(`/profile/${profile.username}`);
    }
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] pb-safe">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href === '/profile/me' && pathname?.startsWith('/profile/'));
          const isProfile = item.href === '/profile/me';

          return (
            <Link
              key={item.href}
              href={isProfile && profile ? `/profile/${profile.username}` : item.href}
              onClick={isProfile ? handleProfileClick : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[60px]',
              )}
              aria-label={item.label}
            >
              <div className="relative">
                <span className={cn(
                  'transition-colors-fast',
                  isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                )}>
                  <MobileIcon name={item.icon} />
                </span>
                {item.href === '/messages' && notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[10px] font-bold bg-[var(--accent-primary)] text-white rounded-full">
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </span>
                )}
              </div>
              <span className={cn(
                'text-[10px] font-medium',
                isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Center create button */}
      <Link
        href="/create"
        className="absolute left-1/2 -translate-x-1/2 -top-5"
        aria-label="Create Post"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] text-white shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="M12 5v14" />
          </svg>
        </div>
      </Link>
    </nav>
  );
}

function MobileIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    home: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
    search: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>,
    mail: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>,
    video: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></svg>,
    profile: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>,
  };
  return icons[name] || null;
}