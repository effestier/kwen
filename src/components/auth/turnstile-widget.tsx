'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef } from 'react';
import { useResolvedTheme } from '@/lib/theme/hooks';

interface TurnstileWidgetProps {
  siteKey: string;
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

export function TurnstileWidget({ siteKey, onSuccess, onExpire, onError }: TurnstileWidgetProps) {
  const resolvedTheme = useResolvedTheme();
  const turnstileRef = useRef<TurnstileInstance>(null);

  return (
    <div className="flex justify-center min-h-[65px]">
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        onSuccess={onSuccess}
        onExpire={onExpire}
        onError={onError}
        options={{
          theme: resolvedTheme === 'dark' ? 'dark' : 'light',
          action: 'auth',
          size: 'normal',
        }}
      />
    </div>
  );
}
