'use client'

import { useState, useRef } from 'react'
import type { MediaItem } from './media-picker'

interface MediaPreviewProps {
  items: MediaItem[]
  onReorder: (items: MediaItem[]) => void
  onRemove: (id: string) => void
  currentIndex: number
  onIndexChange: (index: number) => void
}

export function MediaPreview({ items, onReorder, onRemove, currentIndex, onIndexChange }: MediaPreviewProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const touchStartX = useRef<number | null>(null)

  const handleDragStart = (idx: number) => {
    setDragIndex(idx)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIndex(idx)
  }

  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }

    const reordered = [...items]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(idx, 0, moved)
    onReorder(reordered)

    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentIndex < items.length - 1) {
        onIndexChange(currentIndex + 1)
      } else if (diff < 0 && currentIndex > 0) {
        onIndexChange(currentIndex - 1)
      }
    }
    touchStartX.current = null
  }

  if (items.length === 0) return null

  return (
    <div className="flex-1 flex flex-col">
      {/* Main preview */}
      <div
        className="flex-1 relative flex items-center justify-center bg-black/5 rounded-lg overflow-hidden mx-4 mt-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {items[currentIndex]?.type === 'video' ? (
          <video
            src={items[currentIndex].url}
            className="max-w-full max-h-full object-contain"
            controls
            muted
            playsInline
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={items[currentIndex]?.url}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        )}

        {/* Remove button */}
        <button
          onClick={() => onRemove(items[currentIndex].id)}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>

        {/* Navigation arrows */}
        {items.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button
                onClick={() => onIndexChange(currentIndex - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            )}
            {currentIndex < items.length - 1 && (
              <button
                onClick={() => onIndexChange(currentIndex + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      {/* Dots indicator */}
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-3">
          {items.map((_, idx) => (
            <button
              key={idx}
              onClick={() => onIndexChange(idx)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                idx === currentIndex ? 'bg-[var(--accent-primary)] w-3' : 'bg-[var(--text-muted)]'
              }`}
            />
          ))}
        </div>
      )}

      {/* Thumbnail strip (reorderable) */}
      {items.length > 1 && (
        <div className="flex gap-2 px-4 pb-4 overflow-x-auto scrollbar-hide">
          {items.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onClick={() => onIndexChange(idx)}
              className={`relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer border-2 transition-all ${
                idx === currentIndex ? 'border-[var(--accent-primary)]' : 'border-transparent'
              } ${dragOverIndex === idx ? 'border-dashed border-white' : ''} ${
                dragIndex === idx ? 'opacity-50' : ''
              }`}
            >
              {item.type === 'video' ? (
                <video src={item.url} className="w-full h-full object-cover" muted />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
