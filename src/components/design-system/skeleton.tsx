'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

// Base skeleton - used for custom loading states
export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
}: SkeletonProps) {
  const variantStyles = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  return (
    <div
      className={cn(
        'skeleton',
        variantStyles[variant],
        className
      )}
      style={{
        width: width ?? '100%',
        height: height ?? (variant === 'text' ? '1em' : '100%'),
      }}
    />
  );
}

// Pre-built skeleton components
export function TextSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={cn(
            'w-full',
            i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  );
}

export function AvatarSkeleton({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const sizeMap = {
    sm: 32,
    md: 40,
    lg: 56,
    xl: 80,
  };

  return (
    <Skeleton
      variant="circular"
      width={sizeMap[size]}
      height={sizeMap[size]}
      className={className}
    />
  );
}

/**
 * Premium Card Skeleton - matches PostCard exact structure
 * Eliminates CLS by matching avatar, text, media, and action button dimensions.
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3 p-4 border-b border-[var(--border-subtle)] animate-pulse', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={32} height={32} className="bg-[var(--bg-tertiary)]" />
        <div className="flex-1 space-y-1.5 pt-0.5">
          <Skeleton variant="text" width="35%" height={14} className="bg-[var(--bg-tertiary)]" />
          <Skeleton variant="text" width="20%" height={12} className="bg-[var(--bg-tertiary)]" />
        </div>
        <Skeleton variant="rectangular" width={24} height={24} className="rounded-full bg-[var(--bg-tertiary)] ml-auto" />
      </div>

      {/* Content */}
      <div className="space-y-2 px-0.5">
        <Skeleton variant="text" width="90%" height={15} className="bg-[var(--bg-tertiary)]" />
        <Skeleton variant="text" width="75%" height={15} className="bg-[var(--bg-tertiary)]" />
      </div>

      {/* Media */}
      <Skeleton className="w-full aspect-square rounded-xl bg-[var(--bg-tertiary)]" />

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 px-0.5">
        <div className="flex gap-4">
          <Skeleton variant="rectangular" width={24} height={24} className="rounded bg-[var(--bg-tertiary)]" />
          <Skeleton variant="rectangular" width={24} height={24} className="rounded bg-[var(--bg-tertiary)]" />
          <Skeleton variant="rectangular" width={24} height={24} className="rounded bg-[var(--bg-tertiary)]" />
        </div>
        <Skeleton variant="rectangular" width={24} height={24} className="rounded bg-[var(--bg-tertiary)]" />
      </div>
    </div>
  );
}

export function ProfileSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-4">
        <AvatarSkeleton size="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="30%" />
          <Skeleton variant="text" width="50%" />
        </div>
      </div>
      <TextSkeleton lines={2} />
      <div className="flex gap-6 pt-2">
        <Skeleton variant="text" width={60} />
        <Skeleton variant="text" width={60} />
        <Skeleton variant="text" width={60} />
      </div>
    </div>
  );
}

export function MessageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-3', className)}>
      <AvatarSkeleton size="sm" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton variant="text" width={100} height={14} />
          <Skeleton variant="text" width={50} height={12} />
        </div>
        <Skeleton variant="text" width="80%" />
      </div>
    </div>
  );
}

/**
 * Premium Story Skeleton - matches Stories component exact structure
 */
export function StorySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-3.5 overflow-x-auto scrollbar-hide px-4 py-2 animate-pulse', className)}>
      {/* My Story */}
      <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
        <Skeleton variant="circular" width={56} height={56} className="border-2 border-transparent bg-[var(--bg-tertiary)]" />
        <Skeleton variant="text" width={48} height={12} className="bg-[var(--bg-tertiary)]" />
      </div>
      {/* Other Users */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <Skeleton variant="circular" width={56} height={56} className="border-[2.5px] border-transparent bg-[var(--bg-tertiary)]" />
          <Skeleton variant="text" width={48} height={12} className="bg-[var(--bg-tertiary)]" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({
  columns = 3,
  rows = 3,
  gap = 1,
  className,
}: {
  columns?: number;
  rows?: number;
  gap?: number;
  className?: string;
}) {
  const total = columns * rows;

  return (
    <div
      className={cn(
        `grid grid-cols-${columns} gap-${gap}`,
        className
      )}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap * 4}px`,
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <Skeleton
          key={i}
          className="aspect-square"
        />
      ))}
    </div>
  );
}

export function ListSkeleton({
  items = 5,
  className,
}: {
  items?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <AvatarSkeleton size="md" />
          <div className="flex-1">
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="40%" className="mt-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative w-full h-screen bg-[var(--bg-secondary)]', className)}>
      <div className="absolute inset-0 flex items-center justify-center">
        <Skeleton className="w-full h-full" />
      </div>
      <div className="absolute bottom-20 left-4 right-16 space-y-3">
        <div className="flex items-center gap-2">
          <AvatarSkeleton size="sm" />
          <Skeleton variant="text" width={120} />
        </div>
        <TextSkeleton lines={2} className="w-3/4" />
      </div>
      <div className="absolute right-3 bottom-24 flex flex-col gap-6 items-center">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="circular" width={40} height={40} />
        ))}
      </div>
    </div>
  );
}

export function SettingsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4 p-3', className)}>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton variant="text" width={140} height={20} />
        <Skeleton variant="text" width={200} height={14} />
      </div>

      {/* Avatar row */}
      <div className="flex items-center gap-4">
        <AvatarSkeleton size="xl" />
        <div className="space-y-2">
          <Skeleton variant="text" width={100} height={14} />
          <Skeleton variant="text" width={80} height={12} />
        </div>
      </div>

      {/* Form fields */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton variant="text" width={80} height={12} />
          <Skeleton height={40} className="rounded-lg" />
        </div>
      ))}

      {/* Toggle rows */}
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="space-y-1">
            <Skeleton variant="text" width={140} height={14} />
            <Skeleton variant="text" width={200} height={12} />
          </div>
          <Skeleton width={44} height={24} className="rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex min-h-screen bg-[var(--bg-primary)]', className)}>
      {/* Sidebar skeleton */}
      <div className="hidden md:flex flex-col w-64 p-3 border-r border-[var(--border-subtle)] space-y-3">
        <Skeleton variant="text" width={100} height={24} />
        <div className="space-y-2 mt-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton variant="rectangular" width={20} height={20} className="rounded" />
              <Skeleton variant="text" width={80 + (i % 3) * 15} />
            </div>
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 max-w-2xl mx-auto p-3 space-y-3">
        {[1, 2, 3].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}