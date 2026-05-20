'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageSkeleton } from '@/components/design-system';

const PUBLIC_ROUTES = ['/', '/auth/login', '/auth/register', '/auth/reset-password', '/privacy', '/terms'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [hasUser, setHasUser] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasUser(!!session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasUser(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const isPublic = PUBLIC_ROUTES.includes(pathname) || pathname.startsWith('/auth/reset-password');

    if (!hasUser && !isPublic) {
      router.replace('/auth/login');
    } else if (hasUser && pathname.startsWith('/auth/') && pathname !== '/auth/reset-password') {
      router.replace('/feed');
    }
  }, [hasUser, loading, pathname, router]);

  if (loading) {
    return <PageSkeleton />;
  }

  return <>{children}</>;
}
