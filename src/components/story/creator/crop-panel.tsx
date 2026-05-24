'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';

interface CropPanelProps {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  onCrop: (transform: CropTransform) => void;
  onClose: () => void;
}

export interface CropTransform {
  scale: number;
  offsetX: number; // percentage -100 to 100
  offsetY: number; // percentage -100 to 100
  aspectRatio: number; // 0 = free
}

const ASPECTS = [
  { name: 'Free', value: 0 },
  { name: '1:1', value: 1 },
  { name: '4:5', value: 4 / 5 },
  { name: '9:16', value: 9 / 16 },
];

export function CropPanel({ mediaUrl, mediaType, onCrop, onClose }: CropPanelProps) {
  const [aspect, setAspect] = useState(0);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pointer gesture tracking
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{
    startScale: number;
    startOffsetX: number;
    startOffsetY: number;
    startDist: number;
    startX: number;
    startY: number;
  } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      gestureRef.current = {
        startScale: scale,
        startOffsetX: offsetX,
        startOffsetY: offsetY,
        startDist: 0,
        startX: e.clientX,
        startY: e.clientY,
      };
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.sqrt((pts[0].x - pts[1].x) ** 2 + (pts[0].y - pts[1].y) ** 2);
      if (gestureRef.current) {
        gestureRef.current.startDist = dist;
        gestureRef.current.startScale = scale;
      }
    }
  }, [scale, offsetX, offsetY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const gesture = gestureRef.current;
    if (!gesture) return;

    if (pointers.current.size === 1) {
      // Pan
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;
      setOffsetX(Math.max(-100, Math.min(100, gesture.startOffsetX + dx * 0.2)));
      setOffsetY(Math.max(-100, Math.min(100, gesture.startOffsetY + dy * 0.2)));
    } else if (pointers.current.size === 2 && gesture.startDist > 0) {
      // Pinch zoom
      const pts = Array.from(pointers.current.values());
      const dist = Math.sqrt((pts[0].x - pts[1].x) ** 2 + (pts[0].y - pts[1].y) ** 2);
      const scaleDelta = dist / gesture.startDist;
      setScale(Math.max(0.5, Math.min(5, gesture.startScale * scaleDelta)));
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gestureRef.current = null;
    }
  }, []);

  const handleApply = useCallback(() => {
    onCrop({ scale, offsetX, offsetY, aspectRatio: aspect });
    hapticLight();
  }, [scale, offsetX, offsetY, aspect, onCrop]);

  const handleReset = useCallback(() => {
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
    hapticLight();
  }, []);

  // Zoom slider
  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setScale(Number(e.target.value));
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 z-10" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={onClose} className="text-white p-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
        <span className="text-white font-medium text-sm">Crop</span>
        <button onClick={handleApply} className="text-white font-semibold text-sm px-3 py-1">
          Done
        </button>
      </div>

      {/* Crop area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      >
        {/* Media with transform */}
        {mediaType === 'video' ? (
          <video
            src={mediaUrl}
            className="max-w-full max-h-full object-contain select-none pointer-events-none"
            style={{
              transform: `scale(${scale}) translate(${offsetX}%, ${offsetY}%)`,
              transition: pointers.current.size > 0 ? 'none' : 'transform 0.2s ease-out',
            }}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt="Crop preview"
            className="max-w-full max-h-full object-contain select-none pointer-events-none"
            style={{
              transform: `scale(${scale}) translate(${offsetX}%, ${offsetY}%)`,
              transition: pointers.current.size > 0 ? 'none' : 'transform 0.2s ease-out',
            }}
            draggable={false}
          />
        )}

        {/* Crop grid overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Dark overlay with center cutout */}
          <div className="absolute inset-0 border-2 border-white/30">
            {/* Rule of thirds grid */}
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/15" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/15" />
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/15" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/15" />
            {/* Corner handles */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white" />
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="p-4 space-y-3 bg-black/80 backdrop-blur-xl" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {/* Zoom slider */}
        <div className="flex items-center gap-3">
          <span className="text-white/50 text-xs">−</span>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.1}
            value={scale}
            onChange={handleZoomSlider}
            className="flex-1 accent-white"
          />
          <span className="text-white/50 text-xs">+</span>
          <span className="text-white/50 text-xs w-10 text-right">{Math.round(scale * 100)}%</span>
        </div>

        {/* Aspect ratio buttons */}
        <div className="grid grid-cols-4 gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a.name}
              onClick={() => { setAspect(a.value); hapticLight(); }}
              className={cn(
                'py-2 rounded-lg text-xs font-medium transition-colors',
                aspect === a.value
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/70'
              )}
            >
              {a.name}
            </button>
          ))}
        </div>

        {/* Reset button */}
        {(scale !== 1 || offsetX !== 0 || offsetY !== 0) && (
          <button
            onClick={handleReset}
            className="w-full py-2 text-white/60 text-xs hover:text-white transition-colors"
          >
            Reset crop
          </button>
        )}
      </div>
    </div>
  );
}
