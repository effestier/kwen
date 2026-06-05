'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface LightboxModalProps {
  url: string;
  mediaPath?: string;
  onClose: () => void;
  onRefreshUrl: (path: string) => Promise<string | null>;
}

export function LightboxModal({ url, mediaPath, onClose, onRefreshUrl }: LightboxModalProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const lastTouchRef = useRef<{ x: number; y: number; dist?: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset transform when image changes
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setImgError(false);
    setImgLoaded(false);
  }, [url]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleImageError = useCallback(async () => {
    if (mediaPath && !imgError) {
      setImgError(true);
      const fresh = await onRefreshUrl(mediaPath);
      if (!fresh) return;
    }
  }, [mediaPath, imgError, onRefreshUrl]);

  // --- Pinch-to-zoom (touch) ---
  const getTouchDist = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      lastTouchRef.current = { x: 0, y: 0, dist: getTouchDist(e.touches) };
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      if (scale > 1) {
        // Panning zoomed image
        dragStartRef.current = { x: t.clientX, y: t.clientY, offsetX: offset.x, offsetY: offset.y };
        setIsDragging(true);
      } else {
        // Swipe-to-dismiss tracking
        lastTouchRef.current = { x: t.clientX, y: t.clientY };
      }
    }
  }, [scale, offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchRef.current?.dist) {
      // Pinch zoom
      const newDist = getTouchDist(e.touches);
      const ratio = newDist / lastTouchRef.current.dist;
      const newScale = Math.min(Math.max(scale * ratio, 1), 4);
      setScale(newScale);
      lastTouchRef.current.dist = newDist;
    } else if (e.touches.length === 1) {
      if (isDragging && dragStartRef.current) {
        const t = e.touches[0];
        const dx = t.clientX - dragStartRef.current.x;
        const dy = t.clientY - dragStartRef.current.y;
        setOffset({ x: dragStartRef.current.offsetX + dx, y: dragStartRef.current.offsetY + dy });
      } else if (scale === 1 && lastTouchRef.current) {
        // Track vertical swipe for dismiss
        const t = e.touches[0];
        const dy = t.clientY - lastTouchRef.current.y;
        if (Math.abs(dy) > 10) {
          setOffset({ x: 0, y: dy });
        }
      }
    }
  }, [scale, isDragging]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      // Swipe-to-dismiss: if dragged down > 80px at scale 1
      if (scale === 1 && Math.abs(offset.y) > 80) {
        onClose();
        return;
      }
      // Snap back if not dismissed
      if (scale === 1) {
        setOffset({ x: 0, y: 0 });
      }
      // If scale < 1, snap back to 1
      if (scale < 1) {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }
      setIsDragging(false);
      dragStartRef.current = null;
      lastTouchRef.current = null;
    } else if (e.touches.length === 1) {
      // One finger left after pinch — switch to pan
      const t = e.touches[0];
      dragStartRef.current = { x: t.clientX, y: t.clientY, offsetX: offset.x, offsetY: offset.y };
      setIsDragging(true);
      lastTouchRef.current = null;
    }
  }, [scale, offset, onClose]);

  // --- Mouse wheel zoom (desktop) ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const newScale = Math.min(Math.max(scale + delta, 1), 4);
    if (newScale === 1) {
      setOffset({ x: 0, y: 0 });
    }
    setScale(newScale);
  }, [scale]);

  // --- Double-tap to zoom (mobile) ---
  const lastTapRef = useRef(0);
  const handleImageTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap: toggle between 1x and 2.5x
      if (scale > 1) {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      } else {
        setScale(2.5);
      }
    }
    lastTapRef.current = now;
  }, [scale]);

  const backdropOpacity = scale === 1 ? Math.max(0.3, 1 - Math.abs(offset.y) / 200) : 0.9;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Image preview"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden animate-fadeIn"
      style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity})` }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Top bar: close + actions */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.download = 'image';
            a.click();
          }}
          aria-label="Open in new tab"
          className="p-2.5 min-w-[44px] min-h-[44px] rounded-full bg-black/40 text-white/80 hover:text-white active:scale-90 transition-all flex items-center justify-center backdrop-blur-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
        </button>
        <button
          onClick={onClose}
          aria-label="Close image"
          className="p-2.5 min-w-[44px] min-h-[44px] rounded-full bg-black/40 text-white/80 hover:text-white active:scale-90 transition-all flex items-center justify-center backdrop-blur-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* Zoom indicator */}
      {scale > 1 && (
        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-black/40 text-white/80 text-xs font-medium backdrop-blur-sm">
          {Math.round(scale * 100)}%
        </div>
      )}

      {/* Loading spinner */}
      {!imgLoaded && !imgError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
        </div>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={url}
        alt="Full size image"
        onLoad={() => setImgLoaded(true)}
        className={cn(
          "max-w-[95vw] max-h-[90vh] object-contain select-none",
          isDragging ? "cursor-grabbing" : scale > 1 ? "cursor-grab" : "cursor-default"
        )}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          touchAction: 'none',
        }}
        onClick={(e) => { e.stopPropagation(); handleImageTap(); }}
        onDoubleClick={() => {
          if (scale > 1) { setScale(1); setOffset({ x: 0, y: 0 }); }
          else { setScale(2.5); }
        }}
        draggable={false}
        onError={handleImageError}
      />

      {/* Swipe hint on first open */}
      {scale === 1 && offset.y === 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-xs pointer-events-none animate-fadeIn">
          Pinch to zoom · Swipe down to close
        </div>
      )}
    </div>
  );
}
