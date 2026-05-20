'use client';

import { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Overlay {
  id: string;
  type: 'text' | 'sticker' | 'drawing' | 'gif' | 'poll' | 'question' | 'countdown';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  data: any;
}

interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: boolean;
  warmth: number;
}

interface StoryPreviewProps {
  media: { url: string; type: 'image' | 'video' };
  filters: FilterSettings;
  overlays: Overlay[];
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onUpdateOverlay: (id: string, updates: Partial<Overlay>) => void;
  onDeleteOverlay: (id: string) => void;
  drawingData: string | null;
  onAddText: (data: any) => void;
}

export function StoryPreview({
  media,
  filters,
  overlays,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlay,
  onDeleteOverlay,
  drawingData,
  onAddText,
}: StoryPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Apply CSS filters
  const filterStyle = {
    filter: `
      brightness(${filters.brightness}%)
      contrast(${filters.contrast}%)
      saturate(${filters.saturation}%)
      blur(${filters.blur}px)
      ${filters.grayscale ? 'grayscale(100%)' : ''}
      ${filters.warmth !== 0 ? `sepia(${Math.abs(filters.warmth) / 100}) hue-rotate(${filters.warmth > 0 ? -10 : 10}deg)` : ''}
    `.trim(),
  };

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const overlay = overlays.find(o => o.id === id);
    if (!overlay) return;

    setDraggingId(id);
    onSelectOverlay(id);

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Handle drag
  const handleDrag = (e: React.MouseEvent) => {
    if (!draggingId || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;

    onUpdateOverlay(draggingId, {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggingId(null);
  };

  // Handle overlay click
  const handleOverlayClick = (id: string) => {
    onSelectOverlay(id);
  };

  // Handle container click (deselect)
  const handleContainerClick = () => {
    onSelectOverlay(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden"
      onClick={handleContainerClick}
      onMouseMove={handleDrag}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
    >
      {/* Media */}
      {media.type === 'video' ? (
        <video
          src={media.url}
          className="max-w-full max-h-full object-contain"
          style={filterStyle}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        <img
          src={media.url}
          alt="Story preview"
          className="max-w-full max-h-full object-contain"
          style={filterStyle}
        />
      )}

      {/* Drawing overlay */}
      {drawingData && (
        <img
          src={drawingData}
          alt="Drawing"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
      )}

      {/* Text/sticker overlays */}
      {overlays.map((overlay) => (
        <div
          key={overlay.id}
          className={cn(
            'absolute cursor-move select-none',
            selectedOverlayId === overlay.id && 'ring-2 ring-white ring-offset-2 ring-offset-black'
          )}
          style={{
            left: `${overlay.x}%`,
            top: `${overlay.y}%`,
            transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
            zIndex: overlay.type === 'drawing' ? 999 : 10,
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleOverlayClick(overlay.id);
          }}
          onMouseDown={(e) => handleDragStart(e, overlay.id)}
        >
          {overlay.type === 'text' && (
            <div
              className="px-3 py-2"
              style={{
                fontSize: `${overlay.data.fontSize || 24}px`,
                color: overlay.data.color || '#FFFFFF',
                backgroundColor: overlay.data.backgroundColor === 'transparent' ? 'transparent' : overlay.data.backgroundColor,
                fontFamily: overlay.data.fontFamily || 'sans-serif',
                fontWeight: overlay.data.bold ? 'bold' : 'normal',
                textAlign: overlay.data.align || 'center',
                whiteSpace: 'pre-wrap',
                maxWidth: '200px',
              }}
            >
              {overlay.data.content}
            </div>
          )}

          {overlay.type === 'gif' && overlay.data.gifUrl && (
            <img
              src={overlay.data.gifUrl}
              alt="GIF"
              className="w-32 h-32 object-contain"
            />
          )}

          {overlay.type === 'sticker' && (
            <div className="flex flex-col items-center">
              {overlay.data.stickerType === 'poll' && (
                <div className="bg-white rounded-xl p-4 min-w-[200px]">
                  <p className="text-black font-semibold text-center mb-3">{overlay.data.question}</p>
                  {overlay.data.options?.map((opt: string, idx: number) => (
                    <div key={idx} className="border border-gray-300 rounded-lg p-2 mb-2 text-black text-sm">
                      {opt}
                    </div>
                  ))}
                </div>
              )}
              {overlay.data.stickerType === 'question' && (
                <div className="bg-white rounded-xl p-4 min-w-[200px]">
                  <p className="text-black font-semibold text-center">{overlay.data.question}</p>
                  <p className="text-gray-500 text-xs text-center mt-2">Tap to answer</p>
                </div>
              )}
              {overlay.data.stickerType === 'location' && (
                <div className="bg-white/90 rounded-full px-4 py-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="text-black font-medium">{overlay.data.text}</span>
                </div>
              )}
              {overlay.data.stickerType === 'mention' && (
                <div className="bg-white/90 rounded-full px-4 py-2">
                  <span className="text-black font-medium">{overlay.data.text}</span>
                </div>
              )}
              {overlay.data.stickerType === 'hashtag' && (
                <div className="bg-white/90 rounded-full px-4 py-2">
                  <span className="text-black font-medium">{overlay.data.text}</span>
                </div>
              )}
              {overlay.data.stickerType === 'link' && (
                <div className="bg-white/90 rounded-full px-4 py-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span className="text-black font-medium truncate max-w-[150px]">{overlay.data.text}</span>
                </div>
              )}
              {overlay.data.stickerType === 'countdown' && (
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-4 min-w-[180px]">
                  <p className="text-white font-semibold text-center text-sm mb-1">{overlay.data.title}</p>
                  <p className="text-white text-2xl font-bold text-center">00:00:00</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Delete button for selected overlay */}
      {selectedOverlayId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteOverlay(selectedOverlayId);
          }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-600 text-white rounded-full text-sm z-50"
        >
          Delete
        </button>
      )}
    </div>
  );
}