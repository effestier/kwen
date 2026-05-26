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
  const [step, setStep] = useState<'pick' | 'name'>('pick')
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

    // Add selected stories to the highlight
    const storyIds = Array.from(selected)
    for (const storyId of storyIds) {
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
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
          {step === 'name' ? (
            <button onClick={() => setStep('pick')} className="text-[var(--text-muted)] text-[15px] font-medium active:opacity-60">
              Back
            </button>
          ) : (
            <button onClick={onClose} className="text-[var(--text-muted)] text-[15px] font-medium active:opacity-60">
              Cancel
            </button>
          )}
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
            {step === 'pick' ? 'Select Stories' : 'New Highlight'}
          </h3>
          {step === 'pick' ? (
            <button
              onClick={() => setStep('name')}
              disabled={selected.size === 0}
              className="text-[var(--accent-primary)] text-[15px] font-semibold active:opacity-60 disabled:opacity-30"
            >
              Next
            </button>
          ) : (
            <div className="w-12" />
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-[var(--destructive)]/10 border-b border-[var(--destructive)]/20 flex items-center justify-between">
            <span className="text-[13px] text-[var(--destructive)]">{error}</span>
            <button onClick={() => setError(null)} className="text-[var(--destructive)] p-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        )}

        {/* Content */}
        {step === 'pick' ? (
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
                <p className="text-[var(--text-muted)] font-medium">No stories available</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">Stories are available after 24 hours</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {stories.map((story) => {
                  const isSelected = selected.has(story.id)
                  return (
                    <button
                      key={story.id}
                      onClick={() => toggleStory(story.id)}
                      className={`relative aspect-[3/4] rounded-lg overflow-hidden bg-[var(--bg-secondary)] ${
                        isSelected ? 'ring-2 ring-[var(--accent-primary)]' : ''
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={story.media_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />

                      {/* Selection indicator */}
                      <div className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
                          : 'border-white/60 bg-black/20'
                      }`}>
                        {isSelected && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
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
        ) : (
          <div className="p-4 space-y-4">
            {/* Selected stories preview */}
            {selected.size > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-2">
                {stories.filter(s => selected.has(s.id)).slice(0, 6).map(story => (
                  <div key={story.id} className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={story.media_url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                {selected.size > 6 && (
                  <div className="w-14 h-14 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-[var(--text-muted)]">+{selected.size - 6}</span>
                  </div>
                )}
              </div>
            )}

            <input
              type="text"
              placeholder="Highlight name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={30}
              autoFocus
              className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            />

            <button
              onClick={handleCreate}
              disabled={!title.trim() || creating}
              className="w-full py-3 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-40"
            >
              {creating ? 'Creating...' : `Create with ${selected.size} ${selected.size === 1 ? 'story' : 'stories'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
