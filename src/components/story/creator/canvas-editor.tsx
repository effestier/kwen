'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';

// ---- Types ----

export interface Overlay {
  id: string;
  type: 'text' | 'sticker' | 'drawing' | 'gif' | 'poll' | 'question' | 'countdown' | 'emoji' | 'time' | 'date' | 'music' | 'mention' | 'hashtag' | 'link' | 'location';
  x: number;       // percentage 0-100
  y: number;       // percentage 0-100
  scale: number;   // 0.2 - 3.0
  rotation: number; // degrees
  data: Record<string, unknown>;
}

export interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: boolean;
  warmth: number;
}

interface CanvasEditorProps {
  media: { url: string; type: 'image' | 'video' };
  filters: FilterSettings;
  overlays: Overlay[];
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onUpdateOverlay: (id: string, updates: Partial<Overlay>) => void;
  onDeleteOverlay: (id: string) => void;
  drawingData: string | null;
  onOpenText: () => void;
  onOpenDraw: () => void;
  onOpenStickers: () => void;
  onOpenFilters: () => void;
  onOpenMusic: () => void;
  onOpenAudience: () => void;
  onClose: () => void;
  onPost: () => void;
  isPosting: boolean;
  children?: React.ReactNode; // bottom toolbar slot
}

// ---- Helpers ----

const MIN_SCALE = 0.2;
const MAX_SCALE = 3.0;
const SNAP_MARGIN = 5; // percentage from edge

function clampScale(s: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

function clampPosition(val: number) {
  return Math.max(SNAP_MARGIN, Math.min(100 - SNAP_MARGIN, val));
}

// ---- Gesture tracking ----

interface PointerState {
  id: number;
  x: number;
  y: number;
}

function getDistance(a: PointerState, b: PointerState) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getAngle(a: PointerState, b: PointerState) {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

// ---- Component ----

export function CanvasEditor({
  media,
  filters,
  overlays,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlay,
  onDeleteOverlay,
  drawingData,
  onOpenText,
  onOpenDraw,
  onOpenStickers,
  onOpenFilters,
  onOpenMusic,
  onOpenAudience,
  onClose,
  onPost,
  isPosting,
  children,
}: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activePointers = useRef<Map<number, PointerState>>(new Map());
  const gestureRef = useRef<{
    overlayId: string;
    startScale: number;
    startRotation: number;
    startX: number;
    startY: number;
    startDist: number;
    startAngle: number;
    pointerStartX: number;
    pointerStartY: number;
  } | null>(null);

  // Apply CSS filters
  const filterStyle: React.CSSProperties = {
    filter: `
      brightness(${filters.brightness}%)
      contrast(${filters.contrast}%)
      saturate(${filters.saturation}%)
      blur(${filters.blur}px)
      ${filters.grayscale ? 'grayscale(100%)' : ''}
      ${filters.warmth !== 0 ? `sepia(${Math.abs(filters.warmth) / 100}) hue-rotate(${filters.warmth > 0 ? -10 : 10}deg)` : ''}
    `.trim(),
  };

  // ---- Pointer event handlers for overlay gestures ----

  const handleOverlayPointerDown = useCallback((e: React.PointerEvent, overlayId: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const overlay = overlays.find(o => o.id === overlayId);
    if (!overlay) return;

    activePointers.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
      // Single pointer — drag start
      gestureRef.current = {
        overlayId,
        startScale: overlay.scale,
        startRotation: overlay.rotation,
        startX: overlay.x,
        startY: overlay.y,
        startDist: 0,
        startAngle: 0,
        pointerStartX: e.clientX,
        pointerStartY: e.clientY,
      };
      onSelectOverlay(overlayId);
    } else if (activePointers.current.size === 2) {
      // Two pointers — pinch/rotate start
      const pointers = Array.from(activePointers.current.values());
      const dist = getDistance(pointers[0], pointers[1]);
      const angle = getAngle(pointers[0], pointers[1]);
      if (gestureRef.current) {
        gestureRef.current.startDist = dist;
        gestureRef.current.startAngle = angle;
      }
    }
  }, [overlays, onSelectOverlay]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    const gesture = gestureRef.current;
    if (!gesture || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    if (activePointers.current.size === 1) {
      // Drag
      const dx = e.clientX - gesture.pointerStartX;
      const dy = e.clientY - gesture.pointerStartY;
      const newX = clampPosition(gesture.startX + (dx / rect.width) * 100);
      const newY = clampPosition(gesture.startY + (dy / rect.height) * 100);
      onUpdateOverlay(gesture.overlayId, { x: newX, y: newY });
    } else if (activePointers.current.size === 2) {
      // Pinch + rotate
      const pointers = Array.from(activePointers.current.values());
      const dist = getDistance(pointers[0], pointers[1]);
      const angle = getAngle(pointers[0], pointers[1]);

      if (gesture.startDist > 0) {
        const scaleDelta = dist / gesture.startDist;
        const newScale = clampScale(gesture.startScale * scaleDelta);

        const angleDelta = angle - gesture.startAngle;
        const newRotation = gesture.startRotation + angleDelta;

        onUpdateOverlay(gesture.overlayId, {
          scale: newScale,
          rotation: newRotation,
        });
      }
    }
  }, [onUpdateOverlay]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size === 0) {
      gestureRef.current = null;
    }
  }, []);

  // ---- Container tap to deselect ----

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'IMG' || (e.target as HTMLElement).tagName === 'VIDEO') {
      onSelectOverlay(null);
    }
  }, [onSelectOverlay]);

  // ---- Render overlay content ----

  const renderOverlayContent = (overlay: Overlay) => {
    switch (overlay.type) {
      case 'text':
        return (
          <div
            className="px-3 py-2 max-w-[240px]"
            style={{
              fontSize: `${(overlay.data.fontSize as number) || 24}px`,
              color: (overlay.data.color as string) || '#FFFFFF',
              backgroundColor: overlay.data.backgroundColor === 'transparent' ? 'transparent' : (overlay.data.backgroundColor as string),
              fontFamily: (overlay.data.fontFamily as string) || 'sans-serif',
              fontWeight: overlay.data.bold ? 'bold' : 'normal',
              textAlign: (overlay.data.align as 'left' | 'center' | 'right') || 'center',
              whiteSpace: 'pre-wrap',
              textShadow: overlay.data.neon ? `0 0 10px ${(overlay.data.color as string) || '#FFFFFF'}, 0 0 20px ${(overlay.data.color as string) || '#FFFFFF'}, 0 0 40px ${(overlay.data.color as string) || '#FFFFFF'}` : undefined,
              borderRadius: overlay.data.bgStyle === 'pill' ? '9999px' : overlay.data.backgroundColor !== 'transparent' ? '8px' : undefined,
              padding: overlay.data.bgStyle === 'pill' ? '6px 16px' : overlay.data.backgroundColor !== 'transparent' ? '12px 16px' : undefined,
            }}
          >
            {(overlay.data.content as string) || 'Text'}
          </div>
        );

      case 'gif':
        return overlay.data.gifUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={overlay.data.gifUrl as string} alt="GIF" className="w-32 h-32 object-contain" />
        ) : null;

      case 'emoji':
        return (
          <span className="text-5xl select-none">{(overlay.data.emoji as string) || '😀'}</span>
        );

      case 'time':
        return (
          <div className="bg-white/90 rounded-full px-4 py-2">
            <span className="text-black font-semibold text-sm">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        );

      case 'date':
        return (
          <div className="bg-white/90 rounded-full px-4 py-2">
            <span className="text-black font-semibold text-sm">
              {new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        );

      case 'music':
        return (
          <div className="bg-white/90 rounded-full px-4 py-2 flex items-center gap-2">
            <span className="text-xs">🎵</span>
            <span className="text-black font-medium text-sm truncate max-w-[150px]">
              {(overlay.data.trackName as string) || 'Music'}
            </span>
          </div>
        );

      case 'mention':
        return (
          <div className="bg-white/90 rounded-full px-4 py-2">
            <span className="text-black font-medium text-sm">{(overlay.data.text as string) || '@user'}</span>
          </div>
        );

      case 'hashtag':
        return (
          <div className="bg-white/90 rounded-full px-4 py-2">
            <span className="text-black font-medium text-sm">{(overlay.data.text as string) || '#tag'}</span>
          </div>
        );

      case 'link':
        return (
          <div className="bg-white/90 rounded-full px-4 py-2 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span className="text-black font-medium text-sm truncate max-w-[150px]">
              {(overlay.data.text as string) || 'link'}
            </span>
          </div>
        );

      case 'location':
        return (
          <div className="bg-white/90 rounded-full px-4 py-2 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="text-black font-medium text-sm">{(overlay.data.text as string) || 'Location'}</span>
          </div>
        );

      case 'sticker':
        return (
          <div className="flex flex-col items-center">
            {overlay.data.stickerType === 'poll' && (
              <div className="bg-white rounded-xl p-4 min-w-[200px]">
                <p className="text-black font-semibold text-center mb-3">{overlay.data.question as string}</p>
                {(overlay.data.options as string[])?.map((opt, idx) => (
                  <div key={idx} className="border border-gray-300 rounded-lg p-2 mb-2 text-black text-sm">{opt}</div>
                ))}
              </div>
            )}
            {overlay.data.stickerType === 'question' && (
              <div className="bg-white rounded-xl p-4 min-w-[200px]">
                <p className="text-black font-semibold text-center">{overlay.data.question as string}</p>
                <p className="text-gray-500 text-xs text-center mt-2">Tap to answer</p>
              </div>
            )}
            {overlay.data.stickerType === 'countdown' && (
              <div className="bg-gradient-to-r from-gray-600 to-gray-800 rounded-xl p-4 min-w-[180px]">
                <p className="text-white font-semibold text-center text-sm mb-1">{overlay.data.title as string}</p>
                <p className="text-white text-2xl font-bold text-center">00:00:00</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ height: '100dvh' }}>
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-3 z-20" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={onClose} className="text-white p-2 bg-black/40 rounded-full backdrop-blur-sm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <div className="flex gap-2">
          {selectedOverlayId && (
            <button
              onClick={() => onDeleteOverlay(selectedOverlayId)}
              className="text-white p-2 bg-black/40 rounded-full backdrop-blur-sm"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          )}
          <button
            onClick={onOpenAudience}
            className="text-white p-2 bg-black/40 rounded-full backdrop-blur-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas area — media + overlays */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onClick={handleContainerClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Media background — cover to fill the canvas like IG stories */}
        {media.type === 'video' ? (
          <video
            src={media.url}
            className="absolute inset-0 w-full h-full object-cover"
            style={filterStyle}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.url}
            alt="Story"
            className="absolute inset-0 w-full h-full object-cover"
            style={filterStyle}
            draggable={false}
          />
        )}

        {/* Drawing overlay */}
        {drawingData && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={drawingData}
            alt="Drawing"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}

        {/* Overlays */}
        {overlays.map((overlay) => {
          const isSelected = overlay.id === selectedOverlayId;
          return (
            <div
              key={overlay.id}
              className={cn(
                'absolute cursor-move select-none touch-none',
                isSelected && 'ring-2 ring-white/70 ring-offset-2 ring-offset-black/50 rounded-lg'
              )}
              style={{
                left: `${overlay.x}%`,
                top: `${overlay.y}%`,
                transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
                zIndex: overlay.type === 'drawing' ? 999 : 10,
                transition: activePointers.current.size > 0 ? 'none' : 'left 0.1s, top 0.1s',
              }}
              onPointerDown={(e) => handleOverlayPointerDown(e, overlay.id)}
            >
              {renderOverlayContent(overlay)}
            </div>
          );
        })}

        {/* Selected overlay action buttons */}
        {selectedOverlayId && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteOverlay(selectedOverlayId);
                hapticLight();
              }}
              className="px-4 py-2 bg-[var(--destructive)]/90 text-white rounded-full text-sm backdrop-blur-sm"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Bottom toolbar — tool buttons */}
      <div className="bg-black/80 backdrop-blur-xl z-20" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {/* Children slot (filters panel, etc.) */}
        {children}

        {/* Tool buttons — video: supported tools only */}
        <div className="flex items-center justify-around px-4 py-3">
          {/* Text — supported for both image and video (burned via FFmpeg drawtext or overlay) */}
          <button onClick={onOpenText} className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
              </svg>
            </div>
            <span className="text-white/70 text-[10px]">Text</span>
          </button>

          {/* Drawing — supported for both (burned as overlay layer) */}
          <button onClick={onOpenDraw} className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="m2 2 7.586 7.586" /><circle cx="11" cy="11" r="2" />
              </svg>
            </div>
            <span className="text-white/70 text-[10px]">Draw</span>
          </button>

          {/* Stickers — supported for both (non-animated stickers burned as static overlay) */}
          <button onClick={onOpenStickers} className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" />
              </svg>
            </div>
            <span className="text-white/70 text-[10px]">Stickers</span>
          </button>

          {/* Filters — supported for both (FFmpeg eq filter for video) */}
          <button onClick={onOpenFilters} className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a10 10 0 0 1 0 20 7 7 0 0 1 0-14 3 3 0 0 0 0-6" />
              </svg>
            </div>
            <span className="text-white/70 text-[10px]">Filters</span>
          </button>

          {/* Music — DISABLED for video (not merged into video audio) */}
          <button
            onClick={media.type === 'video' ? undefined : onOpenMusic}
            disabled={media.type === 'video'}
            className={`flex flex-col items-center gap-1 ${media.type === 'video' ? 'opacity-30' : ''}`}
            title={media.type === 'video' ? 'Music not available for video stories' : undefined}
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <span className="text-white/70 text-[10px]">Music</span>
          </button>
        </div>
      </div>
    </div>
  );
}
