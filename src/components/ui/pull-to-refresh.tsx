'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { hapticLight } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/loader';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
  maxPull?: number;
  enabled?: boolean;
}

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  maxPull = 140,
  enabled = true,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'pulling' | 'threshold' | 'refreshing' | 'complete'>('idle');
  const startY = useRef(0);
  const isPulling = useRef(false);
  const hapticTriggered = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || window.scrollY > 0 || isRefreshing) return;
    startY.current = e.touches[0].clientY;
    isPulling.current = true;
    hapticTriggered.current = false;
    setPhase('pulling');
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    const rawDiff = e.touches[0].clientY - startY.current;

    if (rawDiff <= 0) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }

    // Only activate pull-to-refresh when at the very top and not already scrolling
    if (window.scrollY > 0) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }

    // Progressive resistance: linear up to threshold, then diminishing returns
    let distance: number;
    if (rawDiff < threshold) {
      distance = rawDiff * 0.6;
    } else {
      const overshoot = rawDiff - threshold;
      distance = threshold * 0.6 + overshoot * 0.15;
    }

    distance = Math.min(distance, maxPull);
    setPullDistance(distance);

    if (distance >= threshold * 0.6 && !hapticTriggered.current) {
      hapticTriggered.current = true;
      hapticLight();
      setPhase('threshold');
    }
  }, [isRefreshing, threshold, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= threshold * 0.6) {
      setPhase('refreshing');
      setIsRefreshing(true);
      setPullDistance(threshold * 0.45);
      try {
        await onRefresh();
      } finally {
        setPhase('complete');
        setIsRefreshing(false);
        setPullDistance(0);
        setTimeout(() => setPhase('idle'), 300);
      }
    } else {
      setPullDistance(0);
      setPhase('idle');
    }
  }, [pullDistance, threshold, onRefresh]);

  // Calculate normalized progress (0-1) for the circular indicator
  const progress = Math.min(pullDistance / (threshold * 0.6), 1);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator container */}
      <div
        style={{
          height: pullDistance > 0 || isRefreshing ? Math.max(pullDistance, isRefreshing ? 48 : 0) : 0,
          transition: pullDistance === 0 ? 'height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
          overflow: 'hidden',
        }}
      >
        <div className="flex items-center justify-center h-full">
          {(pullDistance > 0 || isRefreshing) && (
            <PullRing
              progress={progress}
              isRefreshing={isRefreshing}
              phase={phase}
            />
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

// ---- Circular progress ring ----

interface PullRingProps {
  progress: number;
  isRefreshing: boolean;
  phase: string;
}

function PullRing({ progress, isRefreshing, phase }: PullRingProps) {
  if (isRefreshing) {
    return <Spinner size="sm" color="muted" />;
  }

  const size = 22;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress * circumference);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(
        'transition-opacity duration-200',
        phase === 'complete' ? 'opacity-0 scale-75' : 'opacity-100'
      )}
      style={{
        transform: `rotate(${progress * 360}deg)`,
      }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth={strokeWidth}
        opacity={0.25}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--text-primary)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
      />
    </svg>
  );
}