'use client';

import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { MobileHeader } from './mobile-header';
import { useMediaQuery } from '@/lib/hooks/use-media-query';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface MainLayoutProps {
  children: React.ReactNode;
  initialProfile?: Profile | null;
  showSidebar?: boolean;
  showMobileNav?: boolean;
}

export function MainLayout({ children, initialProfile, showSidebar = true, showMobileNav = true }: MainLayoutProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <div className="flex flex-col lg:flex-row min-h-[100dvh] bg-[var(--bg-primary)]">
      {showSidebar && isDesktop && (
        <div className="w-[72px] xl:w-[244px] flex-shrink-0">
          <Sidebar initialProfile={initialProfile} />
        </div>
      )}
      {showMobileNav && !isDesktop && <MobileHeader />}
      <main className={`flex-1 min-w-0 overflow-x-hidden ${showSidebar ? 'lg:ml-0' : ''} pt-12 lg:pt-0 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0`}>
        {children}
      </main>
      {showMobileNav && !isDesktop && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <MobileNav initialProfile={initialProfile} />
        </div>
      )}
    </div>
  );
}
