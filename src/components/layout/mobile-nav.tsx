'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export function MobileNav({ initialProfile }: { initialProfile?: Profile | null }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(initialProfile ?? null);
  const [messageCount, setMessageCount] = useState(0);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const userIdRef = useRef<string | null>(initialProfile?.id ?? null);

  useEffect(() => {
    // Skip profile fetch if already provided server-side
    if (!initialProfile) {
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

        if (data) {
          userIdRef.current = data.id;
          setProfile(data);
          loadMessageCount(data.id);
        }
      }
      loadProfile();
    } else {
      loadMessageCount(initialProfile.id);
    }

    async function loadMessageCount(uid: string) {
      const { count } = await supabase
        .from('conversation_participants')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('has_unread', true);

      setMessageCount(count || 0);
    }

    // Subscribe to new messages for realtime badge updates
    const channel = supabase
      .channel('mobile-messages-badge')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants' }, (payload) => {
        const updated = payload.new as { user_id: string; has_unread: boolean };
        if (updated.user_id === userIdRef.current && userIdRef.current) {
          loadMessageCount(userIdRef.current);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialProfile]);

  const isActive = (href: string) => {
    if (href === '/feed') return pathname === '/feed';
    if (href === '/profile') return pathname?.startsWith('/profile/');
    return pathname?.startsWith(href);
  };

  // L4: Don't redirect to /feed while profile is still loading
  const profileHref = profile ? `/profile/${profile.username}` : null;

  return (
    <nav aria-label="Mobile navigation" className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border-subtle)]/40 bg-[var(--bg-primary)]/70 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)]" style={{ boxShadow: '0 -4px 30px rgba(0,0,0,0.3), 0 -1px 0 rgba(255,255,255,0.03)' }}>
      <div className="flex items-center justify-around h-[52px] [&>a]:active:scale-90 [&>a]:transition-transform [&>a]:duration-150">
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
            <span className="absolute top-1 right-1/2 translate-x-4 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent-red)] text-white text-[9px] font-bold flex items-center justify-center count-pulse">
              {messageCount > 99 ? '99+' : messageCount}
            </span>
          )}
          <span className={`text-[10px] ${isActive('/messages') ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>Messages</span>
        </Link>

        {/* Videos */}
        <Link href="/reels" className="flex flex-col items-center justify-center gap-0.5 w-full h-full" aria-label="Videos" aria-current={isActive('/reels') ? 'page' : undefined}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={isActive('/reels') ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m10 9 5 3-5 3z" />
          </svg>
          <span className={`text-[10px] ${isActive('/reels') ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>Videos</span>
        </Link>

        {/* Profile */}
        {profileHref ? (
          <Link href={profileHref} className="flex flex-col items-center justify-center gap-0.5 w-full h-full" aria-label="Profile" aria-current={isActive('/profile') ? 'page' : undefined}>
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className={`w-7 h-7 rounded-full object-cover ${isActive('/profile') ? 'ring-2 ring-[var(--text-primary)]' : ''}`}
              />
            ) : (
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${isActive('/profile') ? 'bg-[var(--text-primary)] text-[var(--text-inverse)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
                {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <span className={`text-[10px] ${isActive('/profile') ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>Profile</span>
          </Link>
        ) : (
          <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full" aria-label="Profile loading">
            <div className="w-7 h-7 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
            <span className="text-[10px] text-[var(--text-muted)]">Profile</span>
          </div>
        )}
      </div>
    </nav>
  );
}
