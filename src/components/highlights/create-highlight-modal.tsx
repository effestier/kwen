'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createHighlight, addStoryToHighlight } from '@/services/highlights'
import { getUserAvailableStories, type AvailableStory } from '@/services/archive'

interface CreateHighlightModalProps {
  onClose: () => void
  onSuccess: (highlightId: string) => void
}

export function CreateHighlightModal({ onClose, onSuccess }: CreateHighlightModalProps) {
  const [stories, setStories] = useState<AvailableStory[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
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

  const toggleStory = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleCreate = async () => {
    if (!title.trim() || creating) return
    setCreating(true)
    setError(null)

    const result = await createHighlight(title.trim())
    if (result.error) {
      setError(result.error)
      setCreating(false)
      return
    }

    for (const storyId of selected) {
      await addStoryToHighlight(result.id!, storyId)
    }

    onSuccess(result.id!)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-lg bg-[var(--bg-primary)] rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-0 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[var(--border-soft)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
          <button onClick={onClose} className="text-[var(--text-muted)] text-[15px] font-medium active:opacity-60">
            Cancel
          </button>
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">New Highlight</h3>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || creating}
            className="text-[var(--accent-primary)] text-[15px] font-semibold active:opacity-60 disabled:opacity-30"
          >
            {creating ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-[var(--destructive)]/10 border-b border-[var(--destructive)]/20 flex items-center justify-between flex-shrink-0">
            <span className="text-[13px] text-[var(--destructive)]">{error}</span>
            <button onClick={() => setError(null)} className="text-[var(--destructive)] p-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* Title input */}
          <div className="px-4 py-4 border-b border-[var(--border-subtle)]">
            <label className="text-[13px] text-[var(--text-muted)] font-medium mb-2 block">Highlight name</label>
            <input
              type="text"
              placeholder="e.g. Travel, Food, Memories"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={30}
              autoFocus
              className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20"
            />
            {selected.size > 0 && (
              <p className="text-[12px] text-[var(--text-muted)] mt-2">{selected.size} {selected.size === 1 ? 'story' : 'stories'} selected</p>
            )}
          </div>

          {/* Archived stories */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-[13px] text-[var(--text-muted)] font-medium">Your stories</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Select stories to add to this highlight</p>
          </div>

          <div className="px-1 pb-4">
            {loading ? (
              <div className="grid grid-cols-3 gap-1 px-1">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] bg-[var(--bg-tertiary)] animate-pulse rounded-lg" />
                ))}
              </div>
            ) : stories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)] mb-2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <p className="text-[var(--text-muted)] font-medium text-sm">No stories yet</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Stories will appear here after they expire</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1 px-1">
                {stories.map((story) => {
                  const isSelected = selected.has(story.id)
                  return (
                    <button
                      key={story.id}
                      onClick={() => toggleStory(story.id)}
                      className="relative aspect-[3/4] bg-[var(--bg-secondary)] overflow-hidden rounded-lg"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={story.media_url}
                        alt=""
                        className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-60' : ''}`}
                        loading="lazy"
                      />

                      {/* Blue tint overlay when selected */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-[var(--accent-primary)]/20 rounded-lg" />
                      )}

                      {/* Selection checkbox */}
                      <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
                          : 'border-white/50 bg-black/20'
                      }`}>
                        {isSelected && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>

                      {/* Date */}
                      <div className="absolute bottom-0.5 left-0.5 text-[8px] text-white/60 bg-black/30 px-1 rounded-sm">
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
    </div>
  )
}
