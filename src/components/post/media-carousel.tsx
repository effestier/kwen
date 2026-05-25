'use client';

import { useRef, useState, useCallback } from 'react';
import { VideoPlayer } from './video-player';

interface MediaItem {
  id: string;
  storage_path: string;
  media_type: string;
  sort_order: number;
}

interface MediaCarouselProps {
  media: MediaItem[];
  onDoubleTap?: () => void;
  className?: string;
}

export function MediaCarousel({ media, onDoubleTap, className }: MediaCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);
  // H4: Track whether a scroll/swipe happened to suppress false double-taps
  const didScrollRef = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(index);
    // H4: Mark that a scroll happened — suppress taps until settled
    didScrollRef.current = true;
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      didScrollRef.current = false;
    }, 150);
  }, []);

  const handleTap = useCallback(() => {
    // H4: Ignore taps that follow a scroll/swipe gesture
    if (didScrollRef.current) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onDoubleTap?.();
    }
    lastTapRef.current = now;
  }, [onDoubleTap]);

  if (media.length === 0) return null;

  if (media.length === 1) {
    const item = media[0];
    return (
      <div className={className} style={{ aspectRatio: '4/5', maxHeight: '80vh' }} onClick={handleTap}>
        {item.media_type === 'video' ? (
          <VideoPlayer src={item.storage_path} />
        ) : (
          <img
            src={item.storage_path}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto scroll-snap-x mandatory scrollbar-hide"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {media.map((item, i) => (
          <div
            key={item.id}
            className="flex-shrink-0 w-full relative"
            style={{ scrollSnapAlign: 'start', aspectRatio: '4/5', maxHeight: '80vh' }}
            onClick={handleTap}
          >
            {item.media_type === 'video' ? (
              <VideoPlayer src={item.storage_path} active={i === activeIndex} />
            ) : (
              <img
                src={item.storage_path}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            )}
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {media.length > 1 && media.length <= 8 && (
        <div className="flex items-center justify-center gap-1 py-2">
          {media.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-200 ${
                i === activeIndex
                  ? 'w-1.5 h-1.5 bg-[var(--text-primary)]'
                  : 'w-1 h-1 bg-[var(--text-muted)] opacity-30'
              }`}
            />
          ))}
        </div>
      )}

      {/* Counter for many items */}
      {media.length > 8 && (
        <div className="flex items-center justify-center py-2">
          <span className="text-xs text-[var(--text-muted)]">
            {activeIndex + 1} / {media.length}
          </span>
        </div>
      )}
    </div>
  );
}
