'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CaptionEditor } from '@/components/composer/caption-editor'
import { AudienceSelector } from '@/components/composer/audience-selector'

interface EditPostModalProps {
  postId: string
  initialContent: string
  initialLocation?: string
  initialVisibility?: string
  onClose: () => void
  onSave: (updated: { content: string; location: string; visibility: string; edited_at: string }) => void
}

export function EditPostModal({
  postId,
  initialContent,
  initialLocation = '',
  initialVisibility = 'public',
  onClose,
  onSave,
}: EditPostModalProps) {
  const [content, setContent] = useState(initialContent)
  const [location, setLocation] = useState(initialLocation)
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>(
    initialVisibility as 'public' | 'followers' | 'private'
  )
  const [showLocation, setShowLocation] = useState(false)
  const [showAudience, setShowAudience] = useState(false)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const handleSave = async () => {
    if (saving) return
    setSaving(true)

    const { error } = await supabase.rpc('edit_post', {
      p_post_id: postId,
      p_content: content,
      p_location: location || null,
      p_visibility: visibility,
    })

    if (!error) {
      onSave({
        content,
        location,
        visibility,
        edited_at: new Date().toISOString(),
      })
    }
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-lg bg-[var(--bg-primary)] rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <button onClick={onClose} className="text-[var(--text-muted)] text-sm">Cancel</button>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Edit post</h3>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="text-[var(--accent-primary)] text-sm font-semibold disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Done'}
          </button>
        </div>

        {/* Caption */}
        <div className="flex-1 overflow-y-auto">
          <div className="min-h-[150px]">
            <CaptionEditor
              value={content}
              onChange={setContent}
              maxLength={2200}
              placeholder="Write a caption..."
            />
          </div>

          {/* Options */}
          <div className="border-t border-[var(--border-subtle)]">
            <button
              onClick={() => setShowLocation(!showLocation)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <span className="text-sm text-[var(--text-primary)]">{location || 'Add location'}</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>

            {showLocation && (
              <div className="px-4 pb-3">
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Add location"
                  className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-white/20"
                  autoFocus
                />
              </div>
            )}

            <button
              onClick={() => setShowAudience(!showAudience)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
                </svg>
                <span className="text-sm text-[var(--text-primary)]">
                  {visibility === 'public' ? 'Public' : visibility === 'followers' ? 'Followers' : 'Only me'}
                </span>
              </div>
            </button>

            {showAudience && (
              <div className="px-4 pb-3">
                <AudienceSelector value={visibility} onChange={setVisibility} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
