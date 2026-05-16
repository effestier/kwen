'use client';

import * as React from 'react';
import { useState } from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
  '2xl': 'w-24 h-24 text-3xl',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getColorFromName(name: string): string {
  const colors = [
    'bg-violet-600',
    'bg-blue-600',
    'bg-emerald-600',
    'bg-amber-600',
    'bg-rose-600',
    'bg-cyan-600',
    'bg-purple-600',
    'bg-pink-600',
    'bg-indigo-600',
    'bg-teal-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: keyof typeof sizeClasses;
  className?: string;
}

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ src, name, size = 'md', className }, ref) => {
  const [imageError, setImageError] = useState(false);

  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full',
        sizeClasses[size],
        className
      )}
    >
      <AvatarPrimitive.Image
        className="aspect-square h-full w-full object-cover"
        src={imageError ? undefined : src || undefined}
        alt={name}
        onError={() => setImageError(true)}
      />
      <AvatarPrimitive.Fallback
        className={cn(
          'flex h-full w-full items-center justify-center rounded-full font-medium text-white',
          getColorFromName(name)
        )}
      >
        {getInitials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
});
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full object-cover', className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-zinc-800 text-zinc-400 text-sm font-medium',
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback, sizeClasses };

interface AvatarGroupProps {
  users: Array<{ avatar?: string | null; displayName: string }>;
  max?: number;
  size?: keyof typeof sizeClasses;
}

export function AvatarGroup({ users, max = 4, size = 'sm' }: AvatarGroupProps) {
  const displayed = users.slice(0, max);
  const remaining = users.length - max;

  return (
    <div className="flex -space-x-2">
      {displayed.map((user, i) => (
        <div key={i} className="ring-2 ring-black rounded-full">
          <Avatar src={user.avatar} name={user.displayName} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div className={cn(
          'ring-2 ring-black rounded-full flex items-center justify-center',
          sizeClasses[size],
          'bg-[var(--bg-tertiary)]'
        )}>
          <span className="text-xs font-medium text-[var(--text-muted)]">+{remaining}</span>
        </div>
      )}
    </div>
  );
}