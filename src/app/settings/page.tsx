'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsHomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings/account');
  }, [router]);

  return null;
}