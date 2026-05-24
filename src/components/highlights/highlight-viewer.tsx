'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/design-system/skeleton'
import { pushOverlay, popOverlay } from '@/lib/overlay-stack'
import { updateHighlightTitle, removeStoryFromHighlight, updateHighlightCover } from '@/services/highlights'
import type { HighlightStory } from '@/services/highlights'

interface HighlightViewerProps {
  highlightId: string
  highlightTitle: string
  stories: HighlightStory[]
  initialIndex?: number
  onClose: () => void
  isOwner?: boolean
  onStoriesChanged?: (stories: HighlightStory[]) => void
}

export function HighlightViewer({
  highlightId,
  highlightTitle,
  stories,
  initialIndex = 0,
  onClose,
  isOwner = false,
  onStoriesChanged,
}: HighlightViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [progress, setProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [imageError, setImageError] = useState(false)
  const progressRef = useRef<NodeJS.Timeout | null>(null)

  // Long press state
  const [isPaused, setIsPaused] = useState(false)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

  // Video state
  const [videoProgress, setVideoProgress] = useState(0)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Edit mode (for owner)
  const [showEditMenu, setShowEditMenu] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(highlightTitle)
  const [showCoverPicker, setShowCoverPicker] = useState(false)

  const supabase = createClient()
  const currentStory = stories[currentIndex]
  const isVideo = currentStory?.media_type === 'video'
  const duration = isVideo ? 15000 : 5000

  // Register with overlay stack for back button handling
  useEffect(() => {
    pushOverlay(onClose)
    return () => popOverlay()
  }, [onClose])

  const goToNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setProgress(0)
      setIsLoading(true)
      setImageError(false)
    } else {
      onClose()
    }
  }, [currentIndex, stories.length, onClose])

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setProgress(0)
      setIsLoading(true)
      setImageError(false)
    }
  }, [currentIndex])

  // Progress bar timer — H25: For videos, skip timer (video onTimeUpdate + onEnded handle it)
  useEffect(() => {
    if (progressRef.current) {
      clearInterval(progressRef.current)
    }

    if (isPaused || isVideo) return // H25: Don't run timer for videos

    setProgress(0)
    const interval = 50
    const increment = (interval / duration) * 100

    progressRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          goToNext()
          return 100
        }
        return prev + increment
      })
    }, interval)

    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current)
      }
    }
  }, [currentIndex, duration, goToNext, isPaused, isVideo])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goToNext, goToPrevious])

  // Touch handling
  const touchStart = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return

    const touchEnd = e.changedTouches[0].clientX
    const diff = touchStart.current - touchEnd

    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToNext()
      } else {
        goToPrevious()
      }
    }
    touchStart.current = null
  }

  // Long press handler
  const handleLongPressStart = () => {
    longPressTimer.current = setTimeout(() => {
      setIsPaused(true)
    }, 300)
  }

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    setIsPaused(false)
  }

  if (!currentStory) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
      </button>

      {/* Progress bars */}
      <div className="absolute top-4 left-4 right-4 flex gap-1 z-10">
        {stories.map((story, idx) => (
          <div
            key={story.story_id}
            className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-white rounded-full transition-all duration-75"
              style={{
                width: idx === currentIndex
                  ? `${isVideo ? videoProgress : progress}%`
                  : idx < currentIndex
                    ? '100%'
                    : '0%'
              }}
            />
          </div>
        ))}
      </div>

      {/* Highlight info */}
      <div className="absolute top-12 left-4 right-4 flex items-center gap-3 z-10">
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">{highlightTitle}</p>
          <p className="text-white/60 text-xs">
            {currentIndex + 1} of {stories.length}
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowEditMenu(!showEditMenu)}
            className="text-white/70 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        )}
      </div>

      {/* Edit menu */}
      {showEditMenu && (
        <div className="absolute top-20 right-4 w-48 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl z-20 overflow-hidden">
          <button
            onClick={() => {
              setEditingTitle(true)
              setShowEditMenu(false)
            }}
            className="w-full px-4 py-3 text-left text-white hover:bg-[var(--bg-tertiary)] flex items-center gap-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            Edit title
          </button>
          <button
            onClick={() => {
              setShowCoverPicker(true)
              setShowEditMenu(false)
            }}
            className="w-full px-4 py-3 text-left text-white hover:bg-[var(--bg-tertiary)] flex items-center gap-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Choose cover
          </button>
          <button
            onClick={async () => {
              if (!currentStory) return
              setShowEditMenu(false)
              const result = await removeStoryFromHighlight(highlightId, currentStory.story_id)
              if (result.success) {
                const updated = stories.filter((_, i) => i !== currentIndex)
                if (updated.length === 0) {
                  onClose()
                  return
                }
                onStoriesChanged?.(updated)
                if (currentIndex >= updated.length) {
                  setCurrentIndex(updated.length - 1)
                }
              }
            }}
            className="w-full px-4 py-3 text-left text-[var(--destructive)] hover:bg-[var(--bg-tertiary)] flex items-center gap-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Remove from highlight
          </button>
        </div>
      )}

      {/* Story content */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const width = rect.width

          if (x < width / 3) {
            goToPrevious()
          } else if (x > (width * 2) / 3) {
            goToNext()
          }
        }}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
      >
        {isLoading && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {isPaused && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/70">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="4" height="16" rx="1" x="6" y="4" />
              <rect width="4" height="16" rx="1" x="14" y="4" />
            </svg>
          </div>
        )}

        {/* Video progress indicator */}
        {isVideo && isVideoReady && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-32">
            <div className="h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-100"
                style={{ width: `${videoProgress}%` }}
              />
            </div>
          </div>
        )}

        {isVideo ? (
          <video
            ref={videoRef}
            src={currentStory.media_url}
            className="max-w-full max-h-full object-contain"
            autoPlay
            muted
            playsInline
            onLoadedData={() => {
              setIsLoading(false)
              setIsVideoReady(true)
            }}
            onTimeUpdate={() => {
              if (videoRef.current) {
                const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100
                setVideoProgress(progress)
              }
            }}
            onEnded={() => goToNext()}
            onError={() => {
              setIsLoading(false)
              setImageError(true)
            }}
          />
        ) : (
          <img
            src={currentStory.media_url}
            alt="Highlight"
            className={`max-w-full max-h-full object-contain transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false)
              setImageError(true)
            }}
          />
        )}

        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white">Failed to load story</p>
          </div>
        )}
      </div>

      {/* Navigation hints */}
      <div className="absolute inset-y-0 left-0 w-1/3 cursor-pointer" onClick={goToPrevious} />
      <div className="absolute inset-y-0 right-0 w-1/3 cursor-pointer" onClick={goToNext} />

      {/* Edit title modal */}
      {editingTitle && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-[var(--bg-primary)] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Edit title</h3>
            </div>
            <div className="p-4">
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                maxLength={30}
                autoFocus
                className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] rounded-lg text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-white/20"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && titleValue.trim()) {
                    await updateHighlightTitle(highlightId, titleValue.trim())
                    setEditingTitle(false)
                  }
                }}
              />
            </div>
            <div className="flex border-t border-[var(--border-subtle)]">
              <button
                onClick={() => { setEditingTitle(false); setTitleValue(highlightTitle) }}
                className="flex-1 py-3 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (titleValue.trim()) {
                    await updateHighlightTitle(highlightId, titleValue.trim())
                    setEditingTitle(false)
                  }
                }}
                className="flex-1 py-3 text-sm font-semibold text-[var(--accent-primary)] hover:bg-[var(--bg-secondary)]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cover picker modal */}
      {showCoverPicker && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/60">
          <div className="w-full bg-[var(--bg-primary)] rounded-t-2xl max-h-[60vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Choose cover</h3>
              <button onClick={() => setShowCoverPicker(false)} className="text-[var(--text-muted)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 p-2 overflow-y-auto max-h-[50vh]">
              {stories.filter(s => s.media_url).map((story, idx) => (
                <button
                  key={story.story_id}
                  onClick={async () => {
                    await updateHighlightCover(highlightId, story.media_url)
                    setShowCoverPicker(false)
                  }}
                  className="relative aspect-[3/4] rounded-lg overflow-hidden bg-[var(--bg-secondary)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={story.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
