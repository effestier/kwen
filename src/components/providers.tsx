'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from '@/lib/theme/hooks';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}