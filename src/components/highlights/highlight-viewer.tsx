'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/design-system/skeleton'
import { pushOverlay, popOverlay } from '@/lib/overlay-stack'
import { updateHighlightTitle, removeStoryFromHighlight, updateHighlightCover, getHighlightStories, deleteHighlight } from '@/services/highlights'
import type { HighlightStory } from '@/services/highlights'
import { ArchivePickerModal } from './archive-picker-modal'

interface HighlightViewerProps {
  highlightId: string
  highlightTitle: string
  stories: HighlightStory[]
  initialIndex?: number
  onClose: () => void
  isOwner?: boolean
  onStoriesChanged?: (stories: HighlightStory[]) => void
  onDeleted?: () => void
}

export function HighlightViewer({
  highlightId,
  highlightTitle,
  stories,
  initialIndex = 0,
  onClose,
  isOwner = false,
  onStoriesChanged,
  onDeleted,
}: HighlightViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [progress, setProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [imageError, setImageError] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('kw-story-muted') === 'true'
  })
  const progressRef = useRef<number | null>(null)

  // Desktop detection
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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
  const [showArchivePicker, setShowArchivePicker] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  // M16: Use requestAnimationFrame to prevent setInterval drift
  useEffect(() => {
    if (progressRef.current) {
      cancelAnimationFrame(progressRef.current)
      progressRef.current = null
    }

    if (isPaused || isVideo) return

    setProgress(0)
    let startTime: number | null = null

    const tick = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const pct = Math.min((elapsed / duration) * 100, 100)

      setProgress(pct)

      if (pct >= 100) {
        goToNext()
        return
      }

      progressRef.current = requestAnimationFrame(tick)
    }

    progressRef.current = requestAnimationFrame(tick)

    return () => {
      if (progressRef.current) {
        cancelAnimationFrame(progressRef.current)
        progressRef.current = null
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
      className="fixed inset-0 z-50 bg-black/90 sm:bg-black/80 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full h-full sm:max-w-[420px] sm:max-h-[750px] sm:rounded-2xl overflow-hidden bg-black">
      {/* Top controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {isVideo && (
          <button
            onClick={() => {
              const next = !isMuted
              setIsMuted(next)
              localStorage.setItem('kw-story-muted', String(next))
              if (videoRef.current) videoRef.current.muted = next
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            {isMuted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" x2="17" y1="9" y2="15" /><line x1="17" x2="23" y1="9" y2="15" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
            )}
          </button>
        )}
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

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

      {/* Edit menu — bottom sheet on mobile, dropdown on desktop */}
      {showEditMenu && (
        <>
          <div className="fixed inset-0 z-40 sm:absolute" onClick={() => setShowEditMenu(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 sm:absolute sm:inset-auto sm:top-20 sm:right-4 sm:w-48">
            <div className="bg-[var(--bg-secondary)] sm:border sm:border-[var(--border-subtle)] sm:rounded-xl rounded-t-2xl overflow-hidden animate-slideInUp sm:animate-none">
              <div className="flex justify-center pt-2 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-[var(--border-subtle)]" />
              </div>
              <button
                onClick={() => {
                  setEditingTitle(true)
                  setShowEditMenu(false)
                }}
                className="w-full px-4 py-3.5 text-left text-white active:bg-[var(--bg-tertiary)] flex items-center gap-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                className="w-full px-4 py-3.5 text-left text-white active:bg-[var(--bg-tertiary)] flex items-center gap-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                Choose cover
              </button>
              <button
                onClick={() => {
                  setShowArchivePicker(true)
                  setShowEditMenu(false)
                }}
                className="w-full px-4 py-3.5 text-left text-white active:bg-[var(--bg-tertiary)] flex items-center gap-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="5" x="2" y="3" rx="1" />
                  <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                  <path d="M10 12h4" />
                </svg>
                Add from archive
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
            className="w-full px-4 py-3.5 text-left text-[var(--destructive)] active:bg-[var(--bg-tertiary)] flex items-center gap-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Remove from highlight
          </button>
          <div className="h-px bg-[var(--border-subtle)] mx-2" />
          <button
            onClick={() => {
              setShowEditMenu(false)
              setShowDeleteConfirm(true)
            }}
            className="w-full px-4 py-3.5 text-left text-[var(--destructive)] active:bg-[var(--bg-tertiary)] flex items-center gap-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Delete highlight
          </button>
              <button
                onClick={() => setShowEditMenu(false)}
                className="w-full px-4 py-3.5 text-center text-white/60 text-sm border-t border-[var(--border-subtle)] sm:hidden"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
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
            muted={isMuted}
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

      {/* Archive picker modal */}
      {showArchivePicker && (
        <ArchivePickerModal
          highlightId={highlightId}
          onClose={() => setShowArchivePicker(false)}
          onAdded={async () => {
            // Refresh the highlight stories
            const updated = await getHighlightStories(highlightId)
            onStoriesChanged?.(updated)
          }}
        />
      )}

      {/* Delete highlight confirmation */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xs bg-[var(--bg-primary)] rounded-2xl overflow-hidden">
            <div className="p-4 text-center">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Delete highlight?</h3>
              <p className="text-sm text-[var(--text-muted)] mt-1">This will permanently delete &quot;{highlightTitle}&quot; and remove all stories from it.</p>
            </div>
            <div className="flex border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const result = await deleteHighlight(highlightId)
                  if (result.success !== false) {
                    setShowDeleteConfirm(false)
                    onDeleted?.()
                    onClose()
                  }
                }}
                className="flex-1 py-3 text-sm font-semibold text-[var(--destructive)] hover:bg-[var(--bg-secondary)]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
