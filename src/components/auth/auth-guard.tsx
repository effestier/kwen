'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppLoader } from '@/components/ui/app-loader';
import { isNativePlatform } from '@/lib/platform';

const PUBLIC_ROUTES = ['/', '/auth/login', '/auth/register', '/auth/reset-password', '/privacy', '/terms', '/download'];

let splashHidden = false;

async function hideSplashOnce() {
  if (splashHidden || !isNativePlatform()) return;
  splashHidden = true;
  try {
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
  const redirectedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        setHasUser(!!session);
      } catch {
        // Supabase failed to initialize — treat as logged out
        if (!mounted) return;
        setHasUser(false);
      } finally {
        if (mounted) {
          setLoading(false);
          hideSplashOnce();
        }
      }
    }

    checkSession();

    // Listen for auth state changes — this is the source of truth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setHasUser(!!session);
      if (event === 'SIGNED_IN') {
        redirectedRef.current = false;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const normalizedPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
    const isPublic = PUBLIC_ROUTES.includes(normalizedPath) || normalizedPath.startsWith('/auth/reset-password');

    if (!hasUser && !isPublic) {
      if (!redirectedRef.current) {
        redirectedRef.current = true;
        router.replace('/auth/login');
      }
    } else if (hasUser && normalizedPath.startsWith('/auth/') && normalizedPath !== '/auth/reset-password') {
      router.replace('/feed');
    } else if (hasUser) {
      redirectedRef.current = false;
    }
  }, [hasUser, loading, pathname, router]);

  if (loading) {
    return <AppLoader />;
  }

  return <>{children}</>;
}
