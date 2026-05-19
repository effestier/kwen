'use client'

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { validateFile, UploadType } from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'

interface FileUploadProps {
  type: UploadType
  onUpload: (urls: string[]) => void
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
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setError(null)

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

    // Upload
    setUploading(true)
    setUploadProgress(0)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        setUploading(false)
        return
      }

      const uploadedUrls: string[] = []
      const bucket = type === 'avatar' ? 'avatars' : type === 'story' ? 'stories' : type === 'message' ? 'messages' : 'posts'
      const folder = type

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i]
        const ext = file.name.split('.').pop() || 'jpg'
        const timestamp = Date.now()
        const random = Math.random().toString(36).substring(2, 8)
        const fileName = `${user.id}/${timestamp}-${i}-${random}.${ext}`

        const { data, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
          })

        if (uploadError) {
          setError(uploadError.message)
          setUploading(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName)

        uploadedUrls.push(urlData.publicUrl)
        setUploadProgress(Math.round(((i + 1) / validFiles.length) * 100))
      }

      onUpload(uploadedUrls)
    } catch (err) {
      setError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const removePreview = (index: number) => {
    setPreviews(previews.filter((_, i) => i !== index))
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
              <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-[var(--bg-secondary)]">
                <img
                  src={preview}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover"
                />
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
            <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2">
              <div
                className="bg-[var(--accent-primary)] h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}

          <button
            type="button"
            onClick={handleClick}
            disabled={uploading}
            className="text-sm text-[var(--accent-primary)] hover:underline"
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
                {uploading ? 'Uploading...' : 'Click to upload'}
              </p>
            </div>
          )}
        </button>
      )}
    </div>
  )
}