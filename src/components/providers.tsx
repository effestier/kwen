'use client';

import { type ReactNode, useEffect } from 'react';
import { ThemeProvider } from '@/lib/theme/hooks';
import { AuthGuard } from '@/components/auth/auth-guard';
import { initCapacitor } from '@/lib/capacitor';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    initCapacitor();
  }, []);

  return (
    <ThemeProvider>
      <AuthGuard>
        {children}
      </AuthGuard>
    </ThemeProvider>
  );
}