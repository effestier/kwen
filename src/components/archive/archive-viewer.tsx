'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { pushOverlay, popOverlay } from '@/lib/overlay-stack'
import { deleteArchivedStory, restoreArchivedStory, downloadArchivedStory, type ArchivedStory } from '@/services/archive'
import { AddToHighlightModal } from '@/components/highlights/add-to-highlight-modal'

interface ArchiveViewerProps {
  stories: ArchivedStory[]
  initialIndex?: number
  onClose: () => void
  onDelete?: (storyId: string) => void
}

export function ArchiveViewer({
  stories,
  initialIndex = 0,
  onClose,
  onDelete,
}: ArchiveViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [progress, setProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [showHighlightModal, setShowHighlightModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const progressRef = useRef<NodeJS.Timeout | null>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

  const currentStory = stories[currentIndex]
  const isVideo = currentStory?.media_type === 'video'
  const duration = isVideo ? 15000 : 5000

  useEffect(() => {
    pushOverlay(onClose)
    return () => popOverlay()
  }, [onClose])

  const goToNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setProgress(0)
      setIsLoading(true)
    } else {
      onClose()
    }
  }, [currentIndex, stories.length, onClose])

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setProgress(0)
      setIsLoading(true)
    }
  }, [currentIndex])

  // Progress timer
  useEffect(() => {
    if (isPaused || isLoading) return

    const interval = 50
    const step = (interval / duration) * 100

    progressRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          goToNext()
          return 0
        }
        return prev + step
      })
    }, interval)

    return () => {
      if (progressRef.current) clearInterval(progressRef.current)
    }
  }, [currentIndex, isPaused, isLoading, duration, goToNext])

  // H24: Track touch start position, navigate on touchEnd (not touchStart) to avoid breaking long-press
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
    longPressTimer.current = setTimeout(() => setIsPaused(true), 300)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
    setIsPaused(false)

    // H24: Only navigate if NOT a long-press and NOT paused
    if (!touchStartRef.current || isPaused) {
      touchStartRef.current = null
      return
    }

    const touch = e.changedTouches[0]
    const dx = Math.abs(touch.clientX - touchStartRef.current.x)
    const dy = Math.abs(touch.clientY - touchStartRef.current.y)

    // Only navigate on tap (not swipe) — small movement threshold
    if (dx < 30 && dy < 30) {
      const x = touch.clientX
      const screenWidth = window.innerWidth
      if (x < screenWidth * 0.3) {
        goToPrev()
      } else if (x > screenWidth * 0.7) {
        goToNext()
      }
    }

    touchStartRef.current = null
  }

  const handleDelete = async () => {
    if (!currentStory) return
    const result = await deleteArchivedStory(currentStory.id)
    if (result.success) {
      onDelete?.(currentStory.id)
      if (stories.length <= 1) {
        onClose()
      } else {
        goToNext()
      }
    }
    setConfirmDelete(false)
    setShowActions(false)
  }

  if (!currentStory) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') goToPrev()
          if (e.key === 'ArrowRight') goToNext()
          if (e.key === 'Escape') onClose()
        }}
        tabIndex={0}
      >
        {/* Progress bars */}
        <div className="flex gap-1 px-3 pt-3">
          {stories.map((_, i) => (
            <div key={i} className="flex-1 h-[2px] bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-100"
                style={{
                  width: i < currentIndex ? '100%' : i === currentIndex ? `${progress}%` : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
            <span className="text-white/60 text-xs">
              {currentIndex + 1} of {stories.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHighlightModal(true)}
              className="text-white/70 hover:text-white text-sm flex items-center gap-1"
              title="Add to highlight"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              onClick={() => setShowActions(!showActions)}
              className="text-white/70 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Media */}
        <div className="flex-1 flex items-center justify-center px-4">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {isVideo ? (
            <video
              src={currentStory.media_url}
              className="max-w-full max-h-full object-contain rounded-lg"
              autoPlay
              muted
              playsInline
              onLoadedData={() => setIsLoading(false)}
              onEnded={goToNext}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={currentStory.media_url}
              alt="Archived story"
              className="max-w-full max-h-full object-contain rounded-lg"
              onLoad={() => setIsLoading(false)}
            />
          )}
        </div>

        {/* Date */}
        <div className="px-4 py-3 text-center">
          <p className="text-white/50 text-xs">
            {new Date(currentStory.created_at).toLocaleDateString([], {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </p>
        </div>

        {/* Actions menu */}
        {showActions && (
          <div className="absolute bottom-16 right-4 bg-[var(--bg-primary)] rounded-xl overflow-hidden shadow-xl min-w-[180px]">
            <button
              onClick={async () => {
                setShowActions(false);
                setRestoring(true);
                const result = await restoreArchivedStory(currentStory.id);
                setRestoring(false);
                if (result.error) {
                  setToast(result.error);
                } else {
                  setToast('Story restored!');
                }
                setTimeout(() => setToast(null), 3000);
              }}
              className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>
              Restore story
            </button>
            <button
              onClick={async () => {
                setShowActions(false);
                await downloadArchivedStory(currentStory.id);
              }}
              className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
              Download
            </button>
            <button
              onClick={() => { setConfirmDelete(true); setShowActions(false) }}
              className="w-full px-4 py-3 text-left text-sm text-[var(--destructive)] hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
              Delete
            </button>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-4 py-2 rounded-xl text-sm font-medium shadow-lg animate-fadeInUp">
            {toast}
          </div>
        )}

        {/* Restoring overlay */}
        {restoring && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="absolute inset-x-4 bottom-4 bg-[var(--bg-primary)] rounded-xl p-4 shadow-xl">
            <p className="text-sm text-[var(--text-primary)] mb-3">Delete this archived story permanently?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 text-sm text-[var(--text-muted)] bg-[var(--bg-secondary)] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 text-sm text-white bg-[var(--destructive)] rounded-lg active:bg-[var(--destructive-hover)]"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add to highlight modal */}
      {showHighlightModal && (
        <AddToHighlightModal
          storyId={currentStory.id}
          storyUrl={currentStory.media_url}
          onClose={() => setShowHighlightModal(false)}
          onSuccess={() => setShowHighlightModal(false)}
        />
      )}
    </>
  )
}
