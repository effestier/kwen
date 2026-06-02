'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/brand/config';
import { signOut } from '@/services/auth';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

const mainNavItems: NavItem[] = [
  {
    href: '/feed',
    label: 'Home',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  },
  {
    href: '/explore',
    label: 'Explore',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>,
  },
  {
    href: '/saved',
    label: 'Saved',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>,
  },
  {
    href: '/messages',
    label: 'Messages',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>,
  },
  {
    href: '/notifications',
    label: 'Notifications',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>,
  },
];

const secondaryNavItems: NavItem[] = [
  {
    href: '/settings/appearance',
    label: 'Settings',
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>,
  },
];

export function Sidebar({ initialProfile }: { initialProfile?: Profile | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(initialProfile ?? null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string | null>(initialProfile?.id ?? null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    // Skip profile fetch if already provided server-side
    if (!initialProfile) {
      async function loadUser() {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;

        let { data: profile } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('id', authUser.id)
          .single();

        if (!profile) {
          const tempUsername = `user_${authUser.id.slice(0, 8)}`;
          const { data: newProfile } = await supabase
            .from('profiles')
            .upsert({
              id: authUser.id,
              username: tempUsername,
              display_name: authUser.email?.split('@')[0] || 'User',
            }, { onConflict: 'id' })
            .select('id, username, display_name, avatar_url')
            .single();
          profile = newProfile;
        }

        if (profile) {
          setUser(profile);
          userIdRef.current = profile.id;
          loadCounts(profile.id);
        }
      }
      loadUser();
    } else {
      // Profile already available — just load counts
      loadCounts(initialProfile.id);
    }

    async function loadCounts(uid: string) {
      const [notifRes, msgRes] = await Promise.all([
        supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('is_read', false),
        supabase
          .from('conversation_participants')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('has_unread', true),
      ]);
      setNotificationCount(notifRes.count || 0);
      setMessageCount(msgRes.count || 0);
    }

    // Subscribe to realtime notifications
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new && (payload.new as any).user_id === userIdRef.current) {
          setNotificationCount(prev => prev + 1);
          window.dispatchEvent(new CustomEvent('notifications-unread'));
        }
      })
      .subscribe();

    // Subscribe to realtime message count updates
    const msgChannel = supabase
      .channel('sidebar-messages')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants' }, (payload) => {
        const updated = payload.new as { user_id: string; has_unread: boolean };
        if (updated.user_id === userIdRef.current) {
          // Reload counts
          if (userIdRef.current) loadCounts(userIdRef.current);
        }
      })
      .subscribe();

    // Listen for notifications-read event from notifications page
    function handleNotificationsRead() {
      setNotificationCount(0);
    }

    // Listen for profile updates from settings
    function handleProfileUpdate(event: CustomEvent) {
      setUser(prev => prev ? {
        ...prev,
        display_name: event.detail.display_name,
        avatar_url: event.detail.avatar_url
      } : null);
    }

    window.addEventListener('profile-updated', handleProfileUpdate as EventListener);

    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('notifications-read', handleNotificationsRead);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('profile-updated', handleProfileUpdate as EventListener);
      window.removeEventListener('notifications-read', handleNotificationsRead);
      supabase.removeChannel(channel);
      supabase.removeChannel(msgChannel);
    };
  }, []);

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen fixed top-0 left-0 border-r border-[var(--border-subtle)]/50 bg-[var(--bg-primary)]/80 backdrop-blur-xl z-40">
      {/* Logo */}
      <div className="p-5">
        <Link href="/feed" className="flex items-center">
          <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">{BRAND.name}</span>
        </Link>
      </div>

      {/* Search */}
      <div className="px-4 mb-3" ref={searchRef}>
        <div className={`relative transition-all ${searchOpen ? 'ring-2 ring-white/20 rounded-lg' : ''}`}>
          <label htmlFor="sidebar-search" className="sr-only">Search</label>
          <input
            id="sidebar-search"
            type="text"
            placeholder="Search"
            aria-label="Search"
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            className="w-full py-2.5 pl-10 pr-4 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none"
          />
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
        </div>
      </div>

      {/* Main Navigation */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-2 overflow-y-auto">
        {mainNavItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center justify-between px-4 py-3 rounded-xl text-[15px] font-medium transition-colors-fast mb-0.5',
                isActive
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn(isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]')}>
                  {item.icon}
                </span>
                <span className={cn(isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]')}>{item.label}</span>
              </div>
              {item.href === '/notifications' && notificationCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-[var(--accent-red)] text-white rounded-full count-pulse">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
              {item.href === '/messages' && messageCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-[var(--accent-red)] text-white rounded-full count-pulse">
                  {messageCount > 99 ? '99+' : messageCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* Secondary Navigation */}
        <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
          {/* Dynamic Profile Link - uses real username */}
          {user && (
            <Link
              href={`/profile/${user.username}`}
              aria-current={pathname?.startsWith('/profile/') ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors-fast mb-0.5',
                pathname?.startsWith('/profile/')
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  className={cn('w-[22px] h-[22px] rounded-full object-cover', pathname?.startsWith('/profile/') && 'ring-2 ring-[var(--text-primary)]')}
                />
              ) : (
                <span className={cn(
                  'w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-semibold',
                  pathname?.startsWith('/profile/') ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                )}>
                  {user.display_name?.charAt(0).toUpperCase() || 'U'}
                </span>
              )}
              <span>Profile</span>
            </Link>
          )}
          {secondaryNavItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors-fast mb-0.5',
                  isActive
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                )}
              >
                <span className={cn(isActive && 'text-[var(--accent-primary)]')}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

      </nav>

      {/* Create Button */}
      <div className="px-4 py-3">
        <Link
          href="/create"
          className="flex items-center justify-center w-full py-3 rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Post
        </Link>
      </div>

      {/* User Account Menu */}
      {user && (
        <div className="p-3 border-t border-[var(--border-subtle)] relative" ref={accountMenuRef}>
          <button
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            aria-expanded={accountMenuOpen}
            aria-haspopup="true"
            aria-label="Account menu"
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors-fast w-full"
          >
            <Avatar
              src={user.avatar_url}
              name={user.display_name}
              size="md"
            />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.display_name}</p>
              <p className="text-xs text-[var(--text-muted)]">@{user.username}</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn('text-[var(--text-muted)] transition-transform', accountMenuOpen && 'rotate-180')}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {accountMenuOpen && (
            <div role="menu" className="absolute bottom-full left-3 right-3 mb-1 py-1.5 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] shadow-lg z-50 menu-enter-left">
              <Link
                href={`/profile/${user.username}`}
                role="menuitem"
                onClick={() => setAccountMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors-fast"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                Profile
              </Link>
              <Link
                href="/settings/account"
                role="menuitem"
                onClick={() => setAccountMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors-fast"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                Settings
              </Link>
              <div className="my-1 border-t border-[var(--border-subtle)]" />
              <button
                role="menuitem"
                onClick={async () => {
                  if (signingOut) return;
                  setSigningOut(true);
                  setAccountMenuOpen(false);
                  // M28: Navigate away BEFORE signing out to prevent
                  // auth listener from fetching profile for cleared session
                  router.push('/');
                  await signOut();
                  router.refresh();
                }}
                disabled={signingOut}
                className="flex items-center gap-3 px-4 py-2.5 w-full text-sm text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors-fast disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}