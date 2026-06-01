'use client';

import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';

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
  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)]">
      {showSidebar && (
        <div className="hidden lg:block w-[72px] xl:w-[244px] flex-shrink-0">
          <Sidebar initialProfile={initialProfile} />
        </div>
      )}
      <main className={`flex-1 min-w-0 ${showSidebar ? 'lg:ml-0' : ''} pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0`}>
        {children}
      </main>
      {showMobileNav && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
          <MobileNav initialProfile={initialProfile} />
        </div>
      )}
    </div>
  );
}
