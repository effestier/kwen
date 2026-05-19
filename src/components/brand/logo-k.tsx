'use client';

import { useTheme } from '@/lib/theme/hooks';

interface LogoKProps {
  /** Size in pixels. Renders a square icon. */
  size?: number;
  /** Override theme. If omitted, uses current theme. */
  variant?: 'dark' | 'light';
  /** Additional CSS classes */
  className?: string;
}

/**
 * KWEN brand "K" lettermark.
 * Monoline geometric K — single-weight strokes, rounded caps.
 * Dark variant: white K on near-black. Light variant: dark K on white.
 */
export function LogoK({ size = 36, variant, className }: LogoKProps) {
  const { theme } = useTheme();
  const isDark = variant ? variant === 'dark' : theme !== 'light';

  const bg = isDark ? '#0B1120' : '#FFFFFF';
  const fg = isDark ? '#F8FAFC' : '#0F172A';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-label="KWEN"
      role="img"
    >
      <rect width="512" height="512" rx="120" fill={bg} />
      <g transform="translate(148, 96)" fill="none" stroke={fg} strokeWidth="44" strokeLinecap="round" strokeLinejoin="round">
        {/* Vertical stem */}
        <line x1="0" y1="0" x2="0" y2="320" />
        {/* Upper arm */}
        <line x1="0" y1="160" x2="120" y2="0" />
        {/* Lower arm */}
        <line x1="0" y1="160" x2="120" y2="320" />
      </g>
    </svg>
  );
}

/**
 * KWEN wordmark — "KWEN" in clean geometric type.
 */
export function Wordmark({ variant, className }: { variant?: 'dark' | 'light'; className?: string }) {
  const { theme } = useTheme();
  const isDark = variant ? variant === 'dark' : theme !== 'light';
  const fill = isDark ? '#F8FAFC' : '#0F172A';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 40"
      width={200}
      height={40}
      className={className}
      aria-label="KWEN"
      role="img"
    >
      <text
        x="0"
        y="30"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="32"
        fontWeight="700"
        letterSpacing="2"
        fill={fill}
      >
        KWEN
      </text>
    </svg>
  );
}
