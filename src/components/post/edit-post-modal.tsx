'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface EditPostModalProps {
  postId: string
  initialContent: string
  initialLocation?: string
  initialVisibility?: string
  initialMedia?: Array<{ id: string; storage_path: string; media_type: string; sort_order: number }>
  initialHideLikes?: boolean
  initialDisableComments?: boolean
  onClose: () => void
  onSave: (updated: {
    content: string
    location: string
    visibility: string
    edited_at: string
    hide_likes?: boolean
    disable_comments?: boolean
    media_order?: string[]
  }) => void
}

type Tab = 'caption' | 'settings'

function isValidMediaUrl(url: string): boolean {
  if (!url) return false
  // Only allow http(s) URLs and relative paths — block javascript:, data:, vbscript:
  return /^(https?:\/\/|\/)/.test(url)
}

export function EditPostModal({
  postId,
  initialContent,
  initialLocation = '',
  initialVisibility = 'public',
  initialMedia = [],
  initialHideLikes = false,
  initialDisableComments = false,
  onClose,
  onSave,
}: EditPostModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('caption')
  const [content, setContent] = useState(initialContent)
  const [location, setLocation] = useState(initialLocation)
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>(
    initialVisibility as 'public' | 'followers' | 'private'
  )
  const [hideLikes, setHideLikes] = useState(initialHideLikes)
  const [disableComments, setDisableComments] = useState(initialDisableComments)
  const [showLocationInput, setShowLocationInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const charCount = content.length
  const maxChars = 2200
  const isOverLimit = charCount > maxChars

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Focus textarea when caption tab is active
  useEffect(() => {
    if (activeTab === 'caption' && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [activeTab])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  const handleSave = async () => {
    if (saving || isOverLimit) return
    setSaving(true)
    setError(null)

    const { error: rpcError } = await supabase.rpc('edit_post', {
      p_post_id: postId,
      p_content: content,
      p_location: location || null,
      p_visibility: visibility,
    })

    if (rpcError) {
      setError('Failed to save. Please try again.')
      setSaving(false)
      return
    }

    // Save hideLikes/disableComments (not in edit_post RPC)
    await supabase.from('posts').update({
      hide_likes: hideLikes,
      disable_comments: disableComments,
    }).eq('id', postId)

    onSave({
      content,
      location,
      visibility,
      edited_at: new Date().toISOString(),
      hide_likes: hideLikes,
      disable_comments: disableComments,
    })
    setSaving(false)
  }

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center transition-all duration-300 ${
        visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/0 backdrop-blur-none'
      }`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* Mobile: full screen. Desktop: centered modal */}
      <div
        className={`w-full sm:max-w-lg bg-[var(--bg-primary)] flex flex-col
          sm:rounded-2xl sm:overflow-hidden sm:max-h-[85vh]
          transition-transform duration-300 ease-out
          ${visible ? 'translate-y-0' : 'translate-y-full'}
          h-[100dvh] sm:h-auto`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
          <button
            onClick={handleClose}
            className="text-[var(--text-muted)] text-[15px] font-medium active:opacity-60 transition-opacity -ml-1 px-2 py-1"
          >
            Cancel
          </button>
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Edit post</h3>
          <button
            onClick={handleSave}
            disabled={saving || isOverLimit || !content.trim()}
            className="text-[15px] font-semibold disabled:opacity-30 active:opacity-60 transition-opacity -mr-1 px-2 py-1"
            style={{ color: saving || isOverLimit ? undefined : 'var(--accent-primary)' }}
          >
            {saving ? (
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : 'Done'}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2.5 bg-[var(--destructive)]/10 border-b border-[var(--destructive)]/20 flex items-center justify-between">
            <span className="text-[13px] text-[var(--destructive)]">{error}</span>
            <button onClick={() => setError(null)} className="text-[var(--destructive)] p-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-[var(--border-subtle)] flex-shrink-0">
          {(['caption', 'settings'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-[14px] font-medium capitalize transition-colors relative ${
                activeTab === tab
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] active:text-[var(--text-secondary)]'
              }`}
            >
              {tab === 'caption' ? 'Caption' : 'Settings'}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-[25%] right-[25%] h-[2px] bg-[var(--text-primary)] rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {activeTab === 'caption' && (
            <div className="flex flex-col min-h-full">
              {/* Textarea */}
              <div className="flex-1 p-4 pb-0">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write a caption..."
                  className="w-full min-h-[200px] sm:min-h-[140px] bg-transparent text-[var(--text-primary)] text-[16px] leading-[1.5] resize-none outline-none placeholder:text-[var(--text-muted)]"
                  maxLength={maxChars + 100}
                  style={{ caretColor: 'var(--accent-primary)' }}
                />
              </div>

              {/* Bottom bar — emoji + counter */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border-subtle)] flex-shrink-0">
                <span className="text-[22px] select-none" role="img" aria-label="Emoji">😀</span>
                <span className={`text-[13px] tabular-nums font-medium ${
                  isOverLimit ? 'text-[var(--destructive)]' : charCount > maxChars * 0.9 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'
                }`}>
                  {charCount}/{maxChars}
                </span>
              </div>

              {/* Location row */}
              <div className="border-t border-[var(--border-subtle)] flex-shrink-0">
                <button
                  onClick={() => setShowLocationInput(!showLocationInput)}
                  className="w-full flex items-center justify-between px-4 py-3.5 active:bg-[var(--bg-secondary)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="text-[15px] text-[var(--text-primary)]">{location || 'Add location'}</span>
                  </div>
                  {location ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setLocation(''); }}
                      className="p-1 -mr-1 text-[var(--text-muted)] active:text-[var(--text-primary)]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  )}
                </button>
                {showLocationInput && (
                  <div className="px-4 pb-3">
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Search for a location"
                      className="w-full px-4 py-3 bg-[var(--bg-secondary)] rounded-xl text-[15px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30 placeholder:text-[var(--text-muted)]"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {/* Media preview */}
              {initialMedia.length > 0 && (
                <div className="border-t border-[var(--border-subtle)] px-4 py-3 flex-shrink-0">
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {[...initialMedia].sort((a, b) => a.sort_order - b.sort_order).map((m, i) => (
                      <div key={m.id} className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-[var(--bg-tertiary)] relative">
                        {m.media_type === 'video' ? (
                          <div className="w-full h-full flex items-center justify-center bg-[var(--bg-tertiary)]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="var(--text-muted)" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          </div>
                        ) : isValidMediaUrl(m.storage_path) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.storage_path} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[var(--bg-tertiary)]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                          </div>
                        )}
                        <div className="absolute bottom-0.5 right-0.5 bg-[var(--bg-primary)]/80 text-[var(--text-primary)] text-[10px] px-1 rounded font-medium">
                          {i + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[12px] text-[var(--text-muted)] mt-2">
                    {initialMedia.length} {initialMedia.length === 1 ? 'item' : 'items'} · Media cannot be changed
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div>
              {/* Audience */}
              <div className="border-b border-[var(--border-subtle)]">
                <p className="px-4 pt-5 pb-2 text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Audience</p>
                {(['public', 'followers', 'private'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setVisibility(opt)}
                    className="w-full flex items-center justify-between px-4 py-3.5 active:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-colors ${
                        visibility === opt ? 'border-[var(--accent-primary)]' : 'border-[var(--border-subtle)]'
                      }`}>
                        {visibility === opt && (
                          <div className="w-[11px] h-[11px] rounded-full bg-[var(--accent-primary)]" />
                        )}
                      </div>
                      <div className="text-left">
                        <span className="text-[15px] text-[var(--text-primary)] capitalize block">{opt}</span>
                        <span className="text-[12px] text-[var(--text-muted)]">
                          {opt === 'public' ? 'Everyone can see this post' : opt === 'followers' ? 'Only your followers' : 'Only visible to you'}
                        </span>
                      </div>
                    </div>
                    {visibility === opt && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Interaction toggles */}
              <div>
                <p className="px-4 pt-5 pb-2 text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Interaction</p>

                {/* Hide likes */}
                <div className="flex items-center justify-between px-4 py-3.5 active:bg-[var(--bg-secondary)] transition-colors">
                  <div className="flex items-center gap-3.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                    </svg>
                    <span className="text-[15px] text-[var(--text-primary)]">Hide like count</span>
                  </div>
                  <button
                    onClick={() => setHideLikes(!hideLikes)}
                    className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 ${
                      hideLikes ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-tertiary)]'
                    }`}
                    role="switch"
                    aria-checked={hideLikes}
                  >
                    <div className={`absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                      hideLikes ? 'translate-x-[22px]' : 'translate-x-[2px]'
                    }`} />
                  </button>
                </div>

                {/* Disable comments */}
                <div className="flex items-center justify-between px-4 py-3.5 active:bg-[var(--bg-secondary)] transition-colors">
                  <div className="flex items-center gap-3.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
                    </svg>
                    <span className="text-[15px] text-[var(--text-primary)]">Turn off commenting</span>
                  </div>
                  <button
                    onClick={() => setDisableComments(!disableComments)}
                    className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 ${
                      disableComments ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-tertiary)]'
                    }`}
                    role="switch"
                    aria-checked={disableComments}
                  >
                    <div className={`absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                      disableComments ? 'translate-x-[22px]' : 'translate-x-[2px]'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
