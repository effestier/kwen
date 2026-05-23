'use client'

import { useState } from 'react'
import { createHighlight } from '@/services/highlights'

interface CreateHighlightModalProps {
  onClose: () => void
  onSuccess: (highlightId: string) => void
}

export function CreateHighlightModal({ onClose, onSuccess }: CreateHighlightModalProps) {
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!title.trim() || creating) return
    setCreating(true)

    const result = await createHighlight(title.trim())

    if (result.error) {
      alert(result.error)
      setCreating(false)
      return
    }

    if (result.id) {
      onSuccess(result.id)
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-[var(--bg-primary)] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">New Highlight</h3>
        </div>

        <div className="p-4">
          <input
            type="text"
            placeholder="Highlight name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={30}
            autoFocus
            className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-white/20"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
          />
        </div>

        <div className="flex border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || creating}
            className="flex-1 py-3 text-sm font-semibold text-[var(--accent-primary)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-40"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
