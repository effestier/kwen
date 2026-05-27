'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getUserHighlights, createHighlight, addStoryToHighlight } from '@/services/highlights'
import type { Highlight } from '@/services/highlights'

interface AddToHighlightModalProps {
  storyId: string
  storyUrl: string
  onClose: () => void
  onSuccess: () => void
}

export function AddToHighlightModal({
  storyId,
  storyUrl,
  onClose,
  onSuccess,
}: AddToHighlightModalProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function loadHighlights() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const data = await getUserHighlights(user.id)
      setHighlights(data)
      setLoading(false)
    }

    loadHighlights()
  }, [])

  const handleAddToHighlight = async (highlightId: string) => {
    setAdding(highlightId)
    setError(null)

    const result = await addStoryToHighlight(highlightId, storyId)

    if (result.error) {
      setError(result.error)
    } else {
      onSuccess()
    }

    setAdding(null)
  }

  const handleCreateAndAdd = async () => {
    if (!newTitle.trim()) return

    setCreating(true)
    setError(null)

    const createResult = await createHighlight(newTitle.trim())

    if (createResult.error) {
      setError(createResult.error)
      setCreating(false)
      return
    }

    const addResult = await addStoryToHighlight(createResult.id!, storyId)

    if (addResult.error) {
      setError(addResult.error)
    } else {
      onSuccess()
    }

    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="bg-[var(--bg-primary)] sm:rounded-2xl rounded-t-2xl w-full sm:max-w-sm overflow-hidden animate-slideInUp sm:animate-none pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[var(--border-subtle)]" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <h3 className="font-semibold text-[var(--text-primary)]">Save to Highlight</h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] active:text-[var(--text-primary)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2.5 bg-[var(--destructive)]/10 border-b border-[var(--destructive)]/20 flex items-center justify-between">
            <span className="text-[13px] text-[var(--destructive)]">{error}</span>
            <button onClick={() => setError(null)} className="text-[var(--destructive)] p-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                  <div className="flex-1 h-4 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : showCreate ? (
            <div className="p-3 space-y-3">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">
                  Highlight name
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Travel, Food, Memories"
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--text-muted)]"
                  autoFocus
                  maxLength={30}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] active:bg-[var(--bg-tertiary)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAndAdd}
                  disabled={creating || !newTitle.trim()}
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--text-inverse)] font-semibold active:opacity-80 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center gap-3 p-3 active:bg-[var(--bg-secondary)] transition-colors"
              >
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                    <path d="M5 12h14" /><path d="M12 5v14" />
                  </svg>
                </div>
                <span className="text-[var(--text-primary)] font-medium">New Highlight</span>
              </button>

              {highlights.map((highlight) => (
                <button
                  key={highlight.id}
                  onClick={() => handleAddToHighlight(highlight.id)}
                  disabled={adding === highlight.id}
                  className="w-full flex items-center gap-3 p-4 active:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-[var(--bg-tertiary)]">
                    {highlight.cover_url ? (
                      <img
                        src={highlight.cover_url}
                        alt={highlight.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[var(--text-primary)] font-medium">{highlight.title}</p>
                    <p className="text-[var(--text-muted)] text-sm">
                      {highlight.story_count || 0} stories
                    </p>
                  </div>
                  {adding === highlight.id && (
                    <div className="w-5 h-5 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                  )}
                </button>
              ))}

              {highlights.length === 0 && (
                <div className="p-3 text-center text-[var(--text-muted)]">
                  No highlights yet. Create your first one!
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
