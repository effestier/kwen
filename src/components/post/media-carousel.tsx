'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
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

/** Max portrait ratio allowed (Instagram's tallest). Taller images get center-cropped. */
const MAX_PORTRAIT_RATIO = 4 / 5;

/** Max height in pixels so tall images don't dominate the feed */
const MAX_HEIGHT_PX = 600;

function AdaptiveImage({ src, onClick }: { src: string; onClick?: () => void }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setRatio(img.naturalWidth / img.naturalHeight);
    }
    setLoaded(true);
  }, []);

  // Before we know the ratio, show a placeholder
  if (ratio === null) {
    return (
      <div className="w-full relative" style={{ aspectRatio: '1/1', maxHeight: MAX_HEIGHT_PX }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className={`w-full h-full object-cover img-fade ${loaded ? 'loaded' : ''}`}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={handleLoad}
          onClick={onClick}
        />
      </div>
    );
  }

  // Portrait image taller than 4:5 → cap at 4:5
  if (ratio < MAX_PORTRAIT_RATIO) {
    return (
      <div className="w-full relative" style={{ aspectRatio: `${MAX_PORTRAIT_RATIO}`, maxHeight: MAX_HEIGHT_PX }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover img-fade loaded"
          loading="lazy"
          decoding="async"
          draggable={false}
          onClick={onClick}
        />
      </div>
    );
  }

  // Square, landscape, or mild portrait → show at natural ratio, just cap height
  return (
    <div className="w-full relative" style={{ maxHeight: MAX_HEIGHT_PX }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="w-full block img-fade loaded"
        style={{ maxHeight: MAX_HEIGHT_PX, objectFit: 'contain' }}
        loading="lazy"
        decoding="async"
        draggable={false}
        onClick={onClick}
      />
    </div>
  );
}

export function MediaCarousel({ media, onDoubleTap, className }: MediaCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);
  const didScrollRef = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(index);
    didScrollRef.current = true;
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      didScrollRef.current = false;
    }, 150);
  }, []);

  const handleTap = useCallback(() => {
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
      <div className={className} onClick={handleTap}>
        {item.media_type === 'video' ? (
          <VideoPlayer src={item.storage_path} />
        ) : (
          <AdaptiveImage src={item.storage_path} />
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
            style={{ scrollSnapAlign: 'start', maxHeight: MAX_HEIGHT_PX }}
            onClick={handleTap}
          >
            {item.media_type === 'video' ? (
              <VideoPlayer src={item.storage_path} active={i === activeIndex} />
            ) : (
              <AdaptiveImage src={item.storage_path} />
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
