'use client';

import { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';

interface MainLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  showMobileNav?: boolean;
}

export function MainLayout({
  children,
  showSidebar = true,
  showMobileNav = true,
}: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-[#09090b]">
      {showSidebar && <Sidebar />}
      <main className={`
        flex-1 min-h-screen pb-20 lg:pb-0
        ${showSidebar ? 'lg:ml-[280px]' : ''}
      `}>
        {children}
      </main>
      {showMobileNav && <MobileNav />}
    </div>
  );
}