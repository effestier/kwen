'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/avatar'
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

  const supabase = createClient()

  // Load user's highlights
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

  // Add story to existing highlight
  const handleAddToHighlight = async (highlightId: string) => {
    setAdding(highlightId)

    const result = await addStoryToHighlight(highlightId, storyId)

    if (result.error) {
      alert(result.error)
    } else {
      onSuccess()
    }

    setAdding(null)
  }

  // Create new highlight and add story
  const handleCreateAndAdd = async () => {
    if (!newTitle.trim()) return

    setCreating(true)

    // Create highlight
    const createResult = await createHighlight(newTitle.trim())

    if (createResult.error) {
      alert(createResult.error)
      setCreating(false)
      return
    }

    // Add story to new highlight
    const addResult = await addStoryToHighlight(createResult.id!, storyId)

    if (addResult.error) {
      alert(addResult.error)
    } else {
      onSuccess()
    }

    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-secondary)] rounded-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <h3 className="font-semibold text-white">Save to Highlight</h3>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

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
            /* Create new highlight form */
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
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-white border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                  autoFocus
                  maxLength={30}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-white hover:bg-[var(--bg-primary)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAndAdd}
                  disabled={creating || !newTitle.trim()}
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--text-inverse)] font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          ) : (
            /* Highlights list */
            <>
              {/* Create new highlight button */}
              <button
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center gap-3 p-3 hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
                    <path d="M5 12h14" /><path d="M12 5v14" />
                  </svg>
                </div>
                <span className="text-white font-medium">New Highlight</span>
              </button>

              {/* Existing highlights */}
              {highlights.map((highlight) => (
                <button
                  key={highlight.id}
                  onClick={() => handleAddToHighlight(highlight.id)}
                  disabled={adding === highlight.id}
                  className="w-full flex items-center gap-3 p-4 hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
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
                    <p className="text-white font-medium">{highlight.title}</p>
                    <p className="text-[var(--text-muted)] text-sm">
                      {highlight.story_count || 0} stories
                    </p>
                  </div>
                  {adding === highlight.id && (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
