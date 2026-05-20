'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { hapticLight } from '@/lib/haptics';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  enabled?: boolean;
}

export function usePullToRefresh({ onRefresh, threshold = 80, enabled = true }: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const hapticTriggered = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
    isPulling.current = true;
    hapticTriggered.current = false;
  }, [enabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) {
      const distance = Math.min(diff * 0.5, threshold * 1.5);
      setPullDistance(distance);
      if (distance >= threshold && !hapticTriggered.current) {
        hapticTriggered.current = true;
        hapticLight();
      }
    }
  }, [isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold * 0.6);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, onRefresh]);

  return {
    pullDistance,
    isRefreshing,
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
