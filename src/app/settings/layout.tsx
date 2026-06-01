'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { signOut } from '@/services/auth';

interface SettingsLayoutProps {
  children: React.ReactNode;
}

type SettingsCategory = {
  name: string;
  href: string;
  icon: React.ReactNode;
  description?: string;
};

const categories: SettingsCategory[] = [
  {
    name: 'Account',
    href: '/settings/account',
    description: 'Personal info, username, password',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" />
      </svg>
    ),
  },
  {
    name: 'Appearance',
    href: '/settings/appearance',
    description: 'Theme, display settings',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
      </svg>
    ),
  },
  {
    name: 'Privacy',
    href: '/settings/privacy',
    description: 'Audience, blocked accounts',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    name: 'Notifications',
    href: '/settings/notifications',
    description: 'Push and email preferences',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    name: 'Security',
    href: '/settings/security',
    description: 'Password, 2FA, sessions',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    name: 'Content',
    href: '/settings/content',
    description: 'Filters, preferences',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 9 5 12 1.8-5.2L21 14Z" /><path d="M7 2h10v10.1c-.6-.3-1.2-.5-1.9-.6L15 5.1 7 2Z" />
      </svg>
    ),
  },
  {
    name: 'Blocked Accounts',
    href: '/settings/blocked',
    description: 'Manage blocked users',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 14.14 14.14" />
      </svg>
    ),
  },
  {
    name: 'Close Friends',
    href: '/settings/close-friends',
    description: 'Manage your close friends list',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    ),
  },
  {
    name: 'Archive',
    href: '/settings/archive',
    description: 'View archived stories',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />
      </svg>
    ),
  },
  {
    name: 'Help',
    href: '/settings/help',
    description: 'Support, report issues',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
      </svg>
    ),
  },
  {
    name: 'About',
    href: '/settings/about',
    description: 'Version, licenses',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
      </svg>
    ),
  },
];

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<{ display_name: string; username: string; avatar_url: string | null } | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // On mobile, hide sidebar when on a sub-page (not /settings root)
  const isSubPage = pathname !== '/settings';

  useEffect(() => {
    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, username, avatar_url')
        .eq('id', authUser.id)
        .single();

      if (profile) setUser(profile);
    }
    loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-6xl mx-auto px-4 py-5">
        <div className={`flex items-center gap-4 ${isSubPage ? 'mb-3' : 'mb-5'}`}>
          <button
            onClick={() => isSubPage ? router.back() : router.push('/feed')}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all"
            aria-label={isSubPage ? "Back" : "Back to Feed"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          {isSubPage ? (
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Settings</h1>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
              {user && (
                <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-secondary)]">
                  <Avatar src={user.avatar_url} name={user.display_name} size="sm" />
                  <span className="text-sm text-[var(--text-secondary)]">@{user.username}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          {/* Sidebar - hidden on mobile sub-pages */}
          <nav aria-label="Settings navigation" className={`lg:w-64 flex-shrink-0 ${isSubPage ? 'hidden lg:block' : ''}`}>
            <div className="space-y-1">
              {categories.map((cat) => {
                const isActive = pathname === cat.href || pathname.startsWith(cat.href + '/');

                return (
                  <Link
                    key={cat.href}
                    href={cat.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl transition-all',
                      isActive
                        ? 'bg-[var(--accent-secondary)] text-[var(--accent-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                    )}
                  >
                    <span className={cn(
                      isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                    )}>
                      {cat.icon}
                    </span>
                    <div>
                      <p className={cn(
                        'font-medium',
                        isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'
                      )}>
                        {cat.name}
                      </p>
                      {cat.description && (
                        <p className="text-xs text-[var(--text-muted)] hidden lg:block">
                          {cat.description}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Sign Out */}
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
              <button
                onClick={async () => {
                  if (signingOut) return;
                  setSigningOut(true);
                  await signOut();
                  router.push('/');
                  router.refresh();
                }}
                disabled={signingOut}
                className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors-fast disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                <span className="font-medium text-sm">{signingOut ? 'Signing out...' : 'Sign out'}</span>
              </button>
            </div>
          </nav>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}