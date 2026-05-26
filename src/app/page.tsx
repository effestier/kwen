'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Spinner } from '@/components/ui/loader';

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/feed');
      } else {
        router.replace('/auth/login');
      }
    });
  }, [router]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg-primary)]">
      <Spinner size="lg" />
    </div>
  );
}
