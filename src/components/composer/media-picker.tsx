'use client'

import { useRef, useCallback } from 'react'

export interface MediaItem {
  id: string
  file: File
  url: string
  type: 'image' | 'video'
  width?: number
  height?: number
}

interface MediaPickerProps {
  selected: MediaItem[]
  onSelect: (items: MediaItem[]) => void
  maxItems?: number
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

export function MediaPicker({ selected, onSelect, maxItems = 10 }: MediaPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const remaining = maxItems - selected.length
    const toProcess = Array.from(files).slice(0, remaining)

    const newItems: MediaItem[] = []

    for (const file of toProcess) {
      if (!ACCEPTED_TYPES.includes(file.type)) continue
      if (file.size > MAX_FILE_SIZE) continue

      const url = URL.createObjectURL(file)
      const type = file.type.startsWith('video/') ? 'video' : 'image'

      // Get dimensions for images
      let width: number | undefined
      let height: number | undefined

      if (type === 'image') {
        const dims = await getImageDimensions(file)
        width = dims.width
        height = dims.height
      }

      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        url,
        type,
        width,
        height,
      })
    }

    onSelect([...selected, ...newItems])
  }, [selected, onSelect, maxItems])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files)
    }
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items)
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null)

    if (files.length > 0) {
      processFiles(files)
    }
  }, [processFiles])

  const removeItem = (id: string) => {
    const item = selected.find(s => s.id === id)
    if (item) URL.revokeObjectURL(item.url)
    onSelect(selected.filter(s => s.id !== id))
  }

  const canAddMore = selected.length < maxItems

  return (
    <div
      className="flex-1 flex flex-col"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={handlePaste}
    >
      {selected.length === 0 ? (
        // Empty state - drag/drop zone
        <div
          className="flex-1 flex flex-col items-center justify-center gap-5 p-8 cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent-primary)]/10 flex items-center justify-center group-active:scale-95 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[var(--text-primary)] font-semibold text-base">Add photos & videos</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">Drag & drop or tap to select</p>
          </div>
          <button className="px-6 py-2.5 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-full text-sm font-semibold active:scale-95 transition-transform">
            Select from device
          </button>
        </div>
      ) : (
        // Selected media grid
        <div className="flex-1 flex flex-col p-4 gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {selected.map((item, idx) => (
              <div key={item.id} className="relative aspect-[4/5] rounded-lg overflow-hidden bg-[var(--bg-secondary)] group">
                {item.type === 'video' ? (
                  <video src={item.url} className="w-full h-full object-cover" muted />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.url} alt="" className="w-full h-full object-cover" />
                )}
                {/* Number badge */}
                <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] text-xs flex items-center justify-center font-semibold">
                  {idx + 1}
                </div>
                {/* Remove button — always visible on mobile, hover-only on desktop */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeItem(item.id) }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
                {/* Video indicator */}
                {item.type === 'video' && (
                  <div className="absolute bottom-1.5 right-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                )}
              </div>
            ))}

            {/* Add more button */}
            {canAddMore && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-[4/5] rounded-lg border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center hover:border-[var(--accent-primary)] transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="M12 5v14" />
                </svg>
              </button>
            )}
          </div>

          <p className="text-xs text-[var(--text-muted)] text-center">
            {selected.length} of {maxItems} selected
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}
