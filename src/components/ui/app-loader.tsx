'use client';

import { BRAND } from '@/lib/brand/config';

export function AppLoader() {
  return (
    <div className="fixed inset-0 z-[200] bg-[var(--bg-primary)] flex flex-col items-center justify-center">
      {/* App name */}
      <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight mb-8">{BRAND.name}</h1>

      {/* Spinner */}
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-full border-2 border-[var(--border-subtle)]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--accent-primary)] animate-spin" />
      </div>
    </div>
  );
}
