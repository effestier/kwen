'use client';

import { useAntiTamper } from '@/lib/anti-tamper';

export function AntiTamper() {
  useAntiTamper();
  return null;
}
