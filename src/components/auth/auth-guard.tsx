'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageSkeleton } from '@/components/design-system';
import { isNativePlatform } from '@/lib/platform';

const PUBLIC_ROUTES = ['/', '/auth/login', '/auth/register', '/auth/reset-password', '/privacy', '/terms'];

let splashHidden = false;

async function hideSplashOnce() {
  if (splashHidden || !isNativePlatform()) return;
  splashHidden = true;
  try {
    // Reveal the body (hidden by inline script in layout.tsx)
    if ((window as any).__capacitorStyle) {
      (window as any).__capacitorStyle.remove();
      document.body.style.opacity = '1';
      document.body.style.pointerEvents = 'auto';
    }
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {}
}

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
      // Hide splash after auth state is known — prevents landing page flash
      hideSplashOnce();
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
