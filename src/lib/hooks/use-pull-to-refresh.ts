'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { hapticLight } from '@/lib/haptics';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
  enabled?: boolean;
}

export function usePullToRefresh({ onRefresh, threshold = 80, maxPull = 140, enabled = true }: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'pulling' | 'threshold' | 'refreshing' | 'complete'>('idle');
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const hapticTriggered = useRef(false);
  const animFrame = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || window.scrollY > 0 || isRefreshing) return;
    startY.current = e.touches[0].clientY;
    currentY.current = startY.current;
    isPulling.current = true;
    hapticTriggered.current = false;
    setPhase('pulling');
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    currentY.current = e.touches[0].clientY;
    const rawDiff = currentY.current - startY.current;

    if (rawDiff <= 0) {
      setPullDistance(0);
      return;
    }

    // Progressive resistance: diminishing returns past threshold
    let distance: number;
    if (rawDiff < threshold) {
      // Linear up to threshold
      distance = rawDiff * 0.6;
    } else {
      // Logarithmic resistance past threshold
      const overshoot = rawDiff - threshold;
      distance = threshold * 0.6 + overshoot * 0.15;
    }

    distance = Math.min(distance, maxPull);
    setPullDistance(distance);

    pullDistanceRef.current = distance;
    if (distance >= threshold * 0.6 && !hapticTriggered.current) {
      hapticTriggered.current = true;
      hapticLight();
      setPhase('threshold');
    }
  }, [isRefreshing, threshold, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistanceRef.current >= threshold * 0.6) {
      setPhase('refreshing');
      setIsRefreshing(true);
      setPullDistance(threshold * 0.45);
      try {
        await onRefresh();
      } finally {
        setPhase('complete');
        setIsRefreshing(false);
        // Smooth snap-back
        setPullDistance(0);
        setTimeout(() => setPhase('idle'), 300);
      }
    } else {
      setPullDistance(0);
      setPhase('idle');
    }
  }, [threshold, onRefresh]);

  // Calculate normalized progress (0-1) for the circular indicator
  const progress = Math.min(pullDistance / (threshold * 0.6), 1);

  return {
    pullDistance,
    isRefreshing,
    phase,
    progress,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}

interface UseScrollPreservationOptions {
  key: string;
  enabled?: boolean;
}

export function useScrollPreservation({ key, enabled = true }: UseScrollPreservationOptions) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Restore scroll position on mount
  useEffect(() => {
    if (!enabled) return;
    const saved = sessionStorage.getItem(`scroll-${key}`);
    if (saved) {
      const pos = parseInt(saved, 10);
      if (pos > 0) {
        requestAnimationFrame(() => {
          window.scrollTo(0, pos);
        });
      }
    }
  }, [key, enabled]);

  // Save scroll position on scroll
  useEffect(() => {
    if (!enabled) return;
    const handleScroll = () => {
      sessionStorage.setItem(`scroll-${key}`, String(window.scrollY));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [key, enabled]);

  return { containerRef };
}
