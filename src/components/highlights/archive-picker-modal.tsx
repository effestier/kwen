'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getUserAvailableStories, type AvailableStory } from '@/services/archive'
import { addStoryToHighlight } from '@/services/highlights'

interface ArchivePickerModalProps {
  highlightId: string
  onClose: () => void
  onAdded: () => void
}

export function ArchivePickerModal({ highlightId, onClose, onAdded }: ArchivePickerModalProps) {
  const [stories, setStories] = useState<AvailableStory[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const available = await getUserAvailableStories(user.id)
      setStories(available)
      setLoading(false)
    }
    load()
  }, [])

  const handleAdd = async (storyId: string) => {
    setAdding(storyId)
    setError(null)

    const result = await addStoryToHighlight(highlightId, storyId)

    if (result.error) {
      setError(result.error)
    } else {
      setAdded(prev => new Set(prev).add(storyId))
      onAdded()
    }
    setAdding(null)
  }

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/70 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-lg bg-[var(--bg-primary)] rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
          <button onClick={onClose} className="text-[var(--text-muted)] text-[15px] font-medium active:opacity-60">
            Cancel
          </button>
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Add from Archive</h3>
          <div className="w-12" />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-[var(--destructive)]/10 border-b border-[var(--destructive)]/20">
            <span className="text-[13px] text-[var(--destructive)]">{error}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-lg bg-[var(--bg-tertiary)] animate-pulse" />
              ))}
            </div>
          ) : stories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)] mb-3" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <p className="text-[var(--text-muted)] font-medium">No archived stories</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">Stories are archived after 24 hours</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {stories.map((story) => {
                const isAdded = added.has(story.id)
                const isAddingThis = adding === story.id

                return (
                  <button
                    key={story.id}
                    onClick={() => !isAdded && !isAddingThis && handleAdd(story.id)}
                    disabled={isAdded || isAddingThis}
                    className="relative aspect-[3/4] rounded-lg overflow-hidden bg-[var(--bg-secondary)] group disabled:opacity-60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={story.media_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Overlay on hover */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                      isAdded ? 'bg-black/40 opacity-100' : 'bg-black/0 group-hover:bg-black/30 opacity-0 group-hover:opacity-100'
                    }`}>
                      {isAddingThis ? (
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : isAdded ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14" /><path d="M12 5v14" />
                        </svg>
                      )}
                    </div>

                    {/* Date badge */}
                    <div className="absolute bottom-1 left-1 text-[9px] text-white/70 bg-black/40 px-1 rounded">
                      {new Date(story.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
