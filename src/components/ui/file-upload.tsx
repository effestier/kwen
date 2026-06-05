'use client'

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { validateFile, UploadType } from '@/lib/storage'
import { uploadMedia, type UploadProgress, type UploadResult } from '@/lib/media'

interface FileUploadProps {
  type: UploadType
  onUpload: (urls: string[], types?: string[], results?: UploadResult[]) => void
  multiple?: boolean
  maxFiles?: number
  className?: string
  children?: React.ReactNode
  accept?: string
}

export function FileUpload({
  type,
  onUpload,
  multiple = false,
  maxFiles = 4,
  className,
  children,
  accept,
}: FileUploadProps) {
  const [previews, setPreviews] = useState<string[]>([])
  const [fileTypes, setFileTypes] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setError(null)
    setProgressMessage(null)

    // Validate all files first
    const validFiles: File[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const validationError = validateFile(file, type)
      if (validationError) {
        setError(validationError)
        return
      }
      validFiles.push(file)
    }

    // Check max files
    if (!multiple && validFiles.length > 1) {
      setError('Only one file allowed')
      return
    }
    if (multiple && validFiles.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`)
      return
    }

    // Generate previews
    const newPreviews = await Promise.all(
      validFiles.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
      })
    )
    setPreviews(newPreviews)
    setFileTypes(validFiles.map(f => f.type))

    // Upload with compression
    setUploading(true)
    setUploadProgress(0)

    try {
      const uploadedUrls: string[] = []
      const uploadedResults: UploadResult[] = []
      const mediaTypes: string[] = []

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i]
        const mediaContext = type === 'avatar' ? 'avatar' : type === 'story' ? 'story' : type === 'message' ? 'message' : 'post'

        const result = await uploadMedia(file, (progress: UploadProgress) => {
          // Each file contributes equally to total progress
          const fileWeight = 1 / validFiles.length
          const baseProgress = i * fileWeight * 100
          const fileProgress = progress.percent * fileWeight
          setUploadProgress(Math.round(baseProgress + fileProgress))
          setProgressMessage(progress.message || null)
        }, mediaContext)

        uploadedUrls.push(result.url)
        uploadedResults.push(result)
        mediaTypes.push(result.duration ? 'video' : 'image')
      }

      onUpload(uploadedUrls, mediaTypes, uploadedResults)
    } catch (err) {
      // Don't expose raw error messages to users
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setProgressMessage(null)
    }
  }

  const removePreview = (index: number) => {
    setPreviews(previews.filter((_, i) => i !== index))
    setFileTypes(fileTypes.filter((_, i) => i !== index))
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={accept || 'image/*'}
        multiple={multiple}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />

      {previews.length > 0 ? (
        <div className="space-y-3">
          <div className={cn(
            'grid gap-2',
            previews.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'
          )}>
            {previews.map((preview, index) => (
              <div key={index} className="relative aspect-[4/5] rounded-lg overflow-hidden bg-[var(--bg-secondary)]">
                {fileTypes[index]?.startsWith('video') ? (
                  <video
                    src={preview}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removePreview(index)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--overlay)] text-white flex items-center justify-center text-sm hover:bg-[var(--bg-overlay)]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2">
                <div
                  className="bg-[var(--accent-primary)] h-2 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              {progressMessage && (
                <p className="text-xs text-[var(--text-muted)]">{progressMessage}</p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}

          <button
            type="button"
            onClick={handleClick}
            disabled={uploading}
            className="text-sm text-[var(--accent-primary)]"
          >
            Add more
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={uploading}
          className="w-full"
        >
          {children || (
            <div className="border-2 border-dashed border-[var(--border-soft)] rounded-lg p-6 text-center hover:border-[var(--accent-primary)] transition-colors">
              <p className="text-sm text-[var(--text-muted)]">
                {uploading ? (progressMessage || 'Processing...') : 'Click to upload'}
              </p>
            </div>
          )}
        </button>
      )}
    </div>
  )
}
