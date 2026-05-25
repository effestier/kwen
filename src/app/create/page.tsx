'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Avatar } from '@/components/ui/avatar'
import { MediaPicker, type MediaItem } from '@/components/composer/media-picker'
import { MediaPreview } from '@/components/composer/media-preview'
import { ImageCropper, type CropRatio } from '@/components/composer/image-cropper'
import { CaptionEditor } from '@/components/composer/caption-editor'
import { AudienceSelector } from '@/components/composer/audience-selector'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { createPostWithMedia } from '@/app/actions/media'
import { uploadMedia } from '@/lib/media'

type Step = 'select' | 'crop' | 'preview' | 'details'

interface Profile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
}

interface Draft {
  id: string
  content: string | null
  media: Array<{ url: string; type: string; storage_path?: string }>
  location: string | null
  visibility: string
  updated_at: string
}

export default function CreatePage() {
  const [step, setStep] = useState<Step>('select')
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const [content, setContent] = useState('')
  const [location, setLocation] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public')
  const [user, setUser] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [showLocation, setShowLocation] = useState(false)
  const [showAudience, setShowAudience] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [cropIndex, setCropIndex] = useState(0)
  const [cropRatio, setCropRatio] = useState<CropRatio>('original')

  const supabase = createClient()
  const router = useRouter()
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/auth/login'); return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', authUser.id)
        .single()
      setUser(profile)
    }
    loadUser()
  }, [])

  // Auto-save draft every 30s
  useEffect(() => {
    if (step !== 'details' || (!content.trim() && mediaItems.length === 0)) return

    autoSaveTimer.current = setInterval(() => {
      saveDraft()
    }, 30000)

    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current)
    }
  }, [step, content, mediaItems])

  const saveDraft = async () => {
    if (!user) return
    const mediaData = mediaItems.map(m => ({ url: m.url, type: m.type }))
    const draftData = { content, media: mediaData, location, visibility }

    if (draftId) {
      await supabase.from('post_drafts').update({ ...draftData, updated_at: new Date().toISOString() }).eq('id', draftId)
    } else {
      const { data } = await supabase.from('post_drafts').insert({ user_id: user.id, ...draftData }).select('id').single()
      if (data) setDraftId(data.id)
    }
  }

  const loadDrafts = async () => {
    const { data } = await supabase
      .from('post_drafts')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(10)
    setDrafts(data || [])
  }

  const handlePublish = async () => {
    if ((!content.trim() && mediaItems.length === 0) || saving) return
    setSaving(true)
    setError(null)

    try {
      // Upload media
      const uploadedUrls: string[] = []
      const uploadResults: Array<{ url: string; type: string }> = []

      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i]
        setUploadProgress(prev => ({ ...prev, [item.id]: 0 }))

        let result: { url: string; type: string }
        try {
          const uploadResult = await uploadMedia(item.file, (progress) => {
            setUploadProgress(prev => ({ ...prev, [item.id]: progress.percent }))
          }, 'post')
          result = { url: uploadResult.url, type: item.type }
        } catch (err) {
          setError(`Upload failed for ${item.file.name}`)
          setSaving(false)
          return
        }

        uploadedUrls.push(result.url)
        uploadResults.push(result)
        setUploadProgress(prev => ({ ...prev, [item.id]: 100 }))
      }

      // Create post
      const formData = new FormData()
      formData.set('content', content)
      formData.set('location', location)
      formData.set('mediaUrls', JSON.stringify(uploadedUrls))
      formData.set('mediaResults', JSON.stringify(uploadResults))
      formData.set('visibility', visibility)

      const result = await createPostWithMedia(formData)

      if (result.error) {
        setError(result.error)
        setSaving(false)
        return
      }

      // Delete draft if it was one
      if (draftId) {
        await supabase.from('post_drafts').delete().eq('id', draftId)
      }

      router.push('/feed')
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const canProceed = mediaItems.length > 0
  const canPublish = content.trim() || mediaItems.length > 0

  return (
    <MainLayout>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)]">
          <div className="flex items-center justify-between px-4 py-3">
            {step === 'select' ? (
              <>
                <button onClick={() => router.back()} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
                <h1 className="text-base font-semibold text-[var(--text-primary)]">New post</h1>
                <button
                  onClick={() => { loadDrafts(); setShowDrafts(true) }}
                  className="text-[var(--accent-primary)] text-sm font-medium"
                >
                  Drafts
                </button>
              </>
            ) : step === 'crop' ? (
              <>
                <button onClick={() => setStep('select')} className="text-[var(--text-muted)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <h1 className="text-base font-semibold text-[var(--text-primary)]">Crop</h1>
                <button
                  onClick={() => setStep('preview')}
                  className="text-[var(--accent-primary)] text-sm font-semibold"
                >
                  Next
                </button>
              </>
            ) : step === 'preview' ? (
              <>
                <button onClick={() => {
                  // Go back to crop if there are images, otherwise select
                  const hasImages = mediaItems.some(m => m.type === 'image')
                  setStep(hasImages ? 'crop' : 'select')
                }} className="text-[var(--text-muted)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <h1 className="text-base font-semibold text-[var(--text-primary)]">Preview</h1>
                <button
                  onClick={() => setStep('details')}
                  className="text-[var(--accent-primary)] text-sm font-semibold"
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setStep('preview')} className="text-[var(--text-muted)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <h1 className="text-base font-semibold text-[var(--text-primary)]">New post</h1>
                <button
                  onClick={handlePublish}
                  disabled={!canPublish || saving}
                  className="text-[var(--accent-primary)] text-sm font-semibold disabled:opacity-40"
                >
                  {saving ? 'Sharing...' : 'Share'}
                </button>
              </>
            )}
          </div>

          {/* Upload progress */}
          {saving && Object.keys(uploadProgress).length > 0 && (
            <div className="px-4 pb-2">
              <div className="h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round(Object.values(uploadProgress).reduce((a, b) => a + b, 0) / Object.keys(uploadProgress).length)}%`
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          {step === 'select' && (
            <MediaPicker
              selected={mediaItems}
              onSelect={(items) => {
                setMediaItems(items)
                if (items.length > 0) {
                  const hasImages = items.some(m => m.type === 'image')
                  if (hasImages) {
                    setCropIndex(0)
                    setCropRatio('original')
                    setStep('crop')
                  } else {
                    setStep('preview')
                  }
                }
              }}
              maxItems={10}
            />
          )}

          {step === 'crop' && (() => {
            const imageItems = mediaItems.filter(m => m.type === 'image')
            const currentItem = imageItems[cropIndex]
            if (!currentItem) {
              // No images left, skip to preview
              setStep('preview')
              return null
            }
            return (
              <ImageCropper
                key={currentItem.id}
                src={currentItem.url}
                ratio={cropRatio}
                onRatioChange={setCropRatio}
                onCrop={async (blob, width, height) => {
                  // Replace the image with the cropped version
                  const croppedFile = new File([blob], currentItem.file.name, { type: 'image/webp' })
                  const croppedUrl = URL.createObjectURL(blob)

                  // Revoke old URL
                  URL.revokeObjectURL(currentItem.url)

                  const updated = mediaItems.map(m =>
                    m.id === currentItem.id
                      ? { ...m, file: croppedFile, url: croppedUrl, width, height }
                      : m
                  )
                  setMediaItems(updated)

                  // Move to next image or preview
                  const nextIndex = cropIndex + 1
                  if (nextIndex < imageItems.length) {
                    setCropIndex(nextIndex)
                    setCropRatio('original')
                  } else {
                    setStep('preview')
                  }
                }}
                onSkip={() => {
                  // Skip this image, move to next or preview
                  const nextIndex = cropIndex + 1
                  if (nextIndex < imageItems.length) {
                    setCropIndex(nextIndex)
                    setCropRatio('original')
                  } else {
                    setStep('preview')
                  }
                }}
              />
            )
          })()}

          {step === 'preview' && (
            <MediaPreview
              items={mediaItems}
              onReorder={setMediaItems}
              onRemove={(id) => {
                const updated = mediaItems.filter(m => m.id !== id)
                setMediaItems(updated)
                if (updated.length === 0) setStep('select')
                if (currentMediaIndex >= updated.length) setCurrentMediaIndex(Math.max(0, updated.length - 1))
              }}
              currentIndex={currentMediaIndex}
              onIndexChange={setCurrentMediaIndex}
            />
          )}

          {step === 'details' && user && (
            <div className="flex-1 flex flex-col">
              {/* User info + caption */}
              <div className="flex items-start gap-3 p-3">
                <Avatar src={user.avatar_url} name={user.display_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <CaptionEditor
                    value={content}
                    onChange={setContent}
                    maxLength={2200}
                    placeholder="Write a caption..."
                  />
                </div>
                {/* Media thumbnail */}
                {mediaItems.length > 0 && (
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                    {mediaItems[0].type === 'video' ? (
                      <video src={mediaItems[0].url} className="w-full h-full object-cover" muted />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={mediaItems[0].url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="border-t border-[var(--border-subtle)]">
                {/* Location */}
                <button
                  onClick={() => setShowLocation(!showLocation)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="text-sm text-[var(--text-primary)]">
                      {location || 'Add location'}
                    </span>
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
                      placeholder="Search for a location"
                      className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] rounded-lg text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-white/20 placeholder:text-[var(--text-muted)]"
                      autoFocus
                    />
                  </div>
                )}

                {/* Audience */}
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
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>

                {showAudience && (
                  <div className="px-4 pb-3">
                    <AudienceSelector value={visibility} onChange={setVisibility} />
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="px-4 py-3">
                  <p className="text-sm text-[var(--destructive)]">{error}</p>
                </div>
              )}

              {/* Save draft button */}
              <div className="mt-auto p-3 border-t border-[var(--border-subtle)]">
                <button
                  onClick={async () => { await saveDraft(); router.push('/feed') }}
                  className="w-full py-2.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Save as draft
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom action bar (select step) */}
        {step === 'select' && mediaItems.length > 0 && (
          <div className="sticky bottom-0 bg-[var(--bg-primary)] border-t border-[var(--border-subtle)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => {
                const hasImages = mediaItems.some(m => m.type === 'image')
                if (hasImages) {
                  setCropIndex(0)
                  setCropRatio('original')
                  setStep('crop')
                } else {
                  setStep('preview')
                }
              }}
              className="w-full py-3 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Next
            </button>
          </div>
        )}

        {/* Drafts modal */}
        {showDrafts && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
            <div className="w-full sm:max-w-md bg-[var(--bg-primary)] rounded-t-2xl sm:rounded-2xl max-h-[70vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Drafts</h3>
                <button onClick={() => setShowDrafts(false)} className="text-[var(--text-muted)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto max-h-[50vh]">
                {drafts.length === 0 ? (
                  <div className="p-6 text-center text-[var(--text-muted)] text-sm">No drafts yet</div>
                ) : (
                  drafts.map(draft => (
                    <button
                      key={draft.id}
                      onClick={() => {
                        setContent(draft.content || '')
                        setLocation(draft.location || '')
                        setVisibility((draft.visibility as 'public' | 'followers' | 'private') || 'public')
                        setDraftId(draft.id)
                        setShowDrafts(false)
                        setStep('details')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors text-left"
                    >
                      {draft.media && draft.media.length > 0 ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--bg-secondary)] flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={draft.media[0].url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">{draft.content || 'No caption'}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {new Date(draft.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
