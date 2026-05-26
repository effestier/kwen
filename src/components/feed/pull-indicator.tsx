'use client';

import { cn } from '@/lib/utils';

interface PullIndicatorProps {
  pullDistance: number;
  progress: number;
  phase: 'idle' | 'pulling' | 'threshold' | 'refreshing' | 'complete';
  isRefreshing: boolean;
}

export function PullIndicator({ progress, phase, isRefreshing }: PullIndicatorProps) {
  const size = 22;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress * circumference);

  return (
    <div className="flex items-center justify-center h-full">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn(
          'transition-opacity duration-200',
          phase === 'complete' ? 'opacity-0 scale-75' : 'opacity-100',
          isRefreshing && 'animate-spin'
        )}
        style={{
          transform: isRefreshing ? undefined : `rotate(${progress * 360}deg)`,
        }}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth={strokeWidth}
          opacity={0.25}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={isRefreshing ? circumference * 0.7 : strokeDashoffset}
          style={{
            transition: isRefreshing ? 'stroke-dashoffset 0.8s ease-in-out' : 'none',
          }}
        />
      </svg>
    </div>
  );
}
