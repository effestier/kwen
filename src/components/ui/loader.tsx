'use client';

import { cn } from '@/lib/utils';

// ---- Circular spinner (full-page, modal, inline) ----

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  color?: 'primary' | 'muted' | 'white';
}

const SIZES = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 36,
} as const;

const STROKE = {
  xs: 2,
  sm: 2,
  md: 2.5,
  lg: 3,
} as const;

export function Spinner({ size = 'md', className, color = 'primary' }: SpinnerProps) {
  const s = SIZES[size];
  const sw = STROKE[size];
  const r = (s - sw) / 2;
  const circumference = 2 * Math.PI * r;

  const colorClass = {
    primary: 'text-[var(--text-primary)]',
    muted: 'text-[var(--text-muted)]',
    white: 'text-white',
  }[color];

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      className={cn('animate-spin', colorClass, className)}
    >
      <circle
        cx={s / 2}
        cy={s / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        opacity={0.2}
      />
      <circle
        cx={s / 2}
        cy={s / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * 0.7}
      />
    </svg>
  );
}

// ---- Full-page centered loader ----

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message }: PageLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
      <Spinner size="lg" />
      {message && (
        <p className="text-xs text-[var(--text-muted)] animate-pulse">{message}</p>
      )}
    </div>
  );
}

// ---- Modal/dialog loader ----

export function ModalLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner size="md" />
    </div>
  );
}

// ---- Button spinner (inline, replaces content) ----

interface ButtonSpinnerProps {
  size?: 'xs' | 'sm';
  color?: 'primary' | 'white';
}

export function ButtonSpinner({ size = 'sm', color = 'white' }: ButtonSpinnerProps) {
  return <Spinner size={size} color={color} className="inline-block" />;
}

// ---- Media overlay loader (for images/videos loading) ----

export function MediaLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)]">
      <Spinner size="sm" color="muted" />
    </div>
  );
}

// ---- Pagination bottom loader ----

export function PaginationLoader() {
  return (
    <div className="flex justify-center py-4">
      <Spinner size="sm" color="muted" />
    </div>
  );
}
