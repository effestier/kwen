'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

// Mobile nav order: Home, Explore, Messages, Reels, Profile (left to right)
const navItems = [
  { href: '/feed', icon: 'home', label: 'Home' },
  { href: '/explore', icon: 'compass', label: 'Explore' },
  { href: '/messages', icon: 'message', label: 'Messages' },
  { href: '/reels', icon: 'play', label: 'Reels' },
];

export function MobileNav() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
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

  // Determine if a nav item is active
  const isActive = (href: string) => {
    if (href === '/feed') return pathname === '/feed';
    if (href === '/explore') return pathname === '/explore';
    if (href === '/messages') return pathname === '/messages';
    if (href === '/reels') return pathname === '/reels';
    return false;
  };

  // Profile is active if pathname starts with /profile/
  const isProfileActive = pathname?.startsWith('/profile/');

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] pb-safe" style={{ minHeight: '72px' }}>
      <div className="flex items-center justify-around h-[72px] px-1">
        {/* Home */}
        <Link
          href="/feed"
          className={`
            flex flex-col items-center justify-center gap-1 px-3 py-3 min-w-[60px] rounded-2xl
            transition-colors-fast
            ${isActive('/feed')
              ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]'
              : 'text-[var(--text-muted)]'
            }
          `}
          style={isActive('/feed') ? { padding: '12px' } : {}}
          aria-label="Home"
        >
          <span className={isActive('/feed') ? 'text-[var(--nav-active-text)]' : ''}>
            <MobileIcon name="home" active={isActive('/feed')} />
          </span>
          <span className={`text-[11px] font-medium ${isActive('/feed') ? 'text-[var(--nav-active-text)]' : ''}`}>
            Home
          </span>
        </Link>

        {/* Explore */}
        <Link
          href="/explore"
          className={`
            flex flex-col items-center justify-center gap-1 px-3 py-3 min-w-[60px] rounded-2xl
            transition-colors-fast
            ${isActive('/explore')
              ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]'
              : 'text-[var(--text-muted)]'
            }
          `}
          style={isActive('/explore') ? { padding: '12px' } : {}}
          aria-label="Explore"
        >
          <span className={isActive('/explore') ? 'text-[var(--nav-active-text)]' : ''}>
            <MobileIcon name="compass" active={isActive('/explore')} />
          </span>
          <span className={`text-[11px] font-medium ${isActive('/explore') ? 'text-[var(--nav-active-text)]' : ''}`}>
            Explore
          </span>
        </Link>

        {/* Messages */}
        <Link
          href="/messages"
          className={`
            flex flex-col items-center justify-center gap-1 px-3 py-3 min-w-[60px] rounded-2xl
            transition-colors-fast relative
            ${isActive('/messages')
              ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]'
              : 'text-[var(--text-muted)]'
            }
          `}
          style={isActive('/messages') ? { padding: '12px' } : {}}
          aria-label="Messages"
        >
          <span className={isActive('/messages') ? 'text-[var(--nav-active-text)]' : ''}>
            <MobileIcon name="message" active={isActive('/messages')} />
          </span>
          {notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[10px] font-bold bg-[var(--accent-primary)] text-white rounded-full">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
          <span className={`text-[11px] font-medium ${isActive('/messages') ? 'text-[var(--nav-active-text)]' : ''}`}>
            Messages
          </span>
        </Link>

        {/* Reels */}
        <Link
          href="/reels"
          className={`
            flex flex-col items-center justify-center gap-1 px-3 py-3 min-w-[60px] rounded-2xl
            transition-colors-fast
            ${isActive('/reels')
              ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]'
              : 'text-[var(--text-muted)]'
            }
          `}
          style={isActive('/reels') ? { padding: '12px' } : {}}
          aria-label="Reels"
        >
          <span className={isActive('/reels') ? 'text-[var(--nav-active-text)]' : ''}>
            <MobileIcon name="play" active={isActive('/reels')} />
          </span>
          <span className={`text-[11px] font-medium ${isActive('/reels') ? 'text-[var(--nav-active-text)]' : ''}`}>
            Reels
          </span>
        </Link>

        {/* Profile */}
        <Link
          href={profile ? `/profile/${profile.username}` : '/feed'}
          className={`
            flex flex-col items-center justify-center gap-1 px-3 py-3 min-w-[60px] rounded-2xl
            transition-colors-fast
            ${isProfileActive
              ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]'
              : 'text-[var(--text-muted)]'
            }
          `}
          style={isProfileActive ? { padding: '12px' } : {}}
          aria-label="Profile"
        >
          <div className={isProfileActive ? 'text-[var(--nav-active-text)]' : ''}>
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="w-6 h-6 rounded-full object-cover overflow-hidden"
              />
            ) : (
              <MobileIcon name="profile" active={isProfileActive} />
            )}
          </div>
          <span className={`text-[11px] font-medium ${isProfileActive ? 'text-[var(--nav-active-text)]' : ''}`}>
            Profile
          </span>
        </Link>
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

function MobileIcon({ name, active }: { name: string; active?: boolean }) {
  const color = active ? 'var(--nav-active-text)' : 'currentColor';

  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
    compass: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
    message: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    play: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
    profile: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="5" />
        <path d="M20 21a8 8 0 1 0-16 0" />
      </svg>
    ),
  };
  return icons[name] || null;
}