'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsHomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings/account');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin h-8 w-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
    </div>
  );
}