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

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-3">
        <AvatarSkeleton size="md" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="25%" />
        </div>
      </div>
      <Skeleton height={120} />
      <div className="flex gap-2">
        <Skeleton width={60} height={28} />
        <Skeleton width={60} height={28} />
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

export function StorySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-3', className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <Skeleton variant="circular" width={56} height={56} />
          <Skeleton variant="text" width={48} />
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