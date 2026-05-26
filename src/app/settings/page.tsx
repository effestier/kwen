'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/loader';

export default function SettingsHomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings/account');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Spinner size="md" />
    </div>
  );
}