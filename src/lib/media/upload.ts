/**
 * Media upload pipeline
 * Handles compression + upload (API route on web, direct Supabase on native)
 */

import { compressImage } from './image-compress'
import { compressVideo, validateVideo, getVideoDuration, type VideoProgress } from './video-compress'
import { isNativePlatform } from '@/lib/platform'

export interface UploadProgress {
  percent: number
  stage: 'compressing' | 'uploading' | 'done'
  message?: string
}

export interface UploadResult {
  id: string
  url: string
  thumbnailUrl?: string
  width?: number
  height?: number
  duration?: number
  format: string
  originalSize: number
  compressedSize: number
}

export type MediaType = 'image' | 'video'

export class RateLimitError extends Error {
  retryAfterSec: number
  constructor(message: string, retryAfterSec: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterSec = retryAfterSec
  }
}

function getMediaType(file: File): MediaType {
  if (file.type.startsWith('video/')) return 'video'
  return 'image'
}

export async function uploadMedia(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  context: 'post' | 'story' | 'message' | 'avatar' = 'post',
  skipCompression: boolean = false,
): Promise<UploadResult> {
  const mediaType = getMediaType(file)
  const originalSize = file.size

  // Validate
  if (mediaType === 'video') {
    const videoContext = context === 'story' ? 'reel' : 'chat'
    const error = validateVideo(file, videoContext)
    if (error) throw new Error(error)
  }

  let compressedFile: File
  let thumbnailFile: File | undefined
  let width: number | undefined
  let height: number | undefined
  let duration: number | undefined

  if (mediaType === 'image') {
    if (skipCompression) {
      // Already composited/compressed — use as-is
      compressedFile = file
      const bitmap = await createImageBitmap(file)
      width = bitmap.width
      height = bitmap.height
      bitmap.close()
    } else {
      onProgress?.({ percent: 10, stage: 'compressing', message: 'Compressing image...' })
      const result = await compressImage(file)
      compressedFile = new File([result.blob], file.name.replace(/\.[^.]+$/, '.webp'), {
        type: 'image/webp',
      })
      width = result.width
      height = result.height
    }
  } else {
    if (skipCompression) {
      // Already composited/compressed — use as-is (e.g. story video after FFmpeg compositing)
      compressedFile = file
      try {
        duration = await getVideoDuration(file)
      } catch {
        // Duration unavailable, not critical
      }
    } else {
      onProgress?.({ percent: 5, stage: 'compressing', message: 'Loading video encoder...' })

      const result = await compressVideo(file, (progress: VideoProgress) => {
        const percent = Math.round(progress.percent * 0.7) // 0-70% for compression
        onProgress?.({
          percent,
          stage: 'compressing',
          message:
            progress.stage === 'loading'
              ? 'Loading video encoder...'
              : progress.stage === 'compressing'
              ? 'Compressing video...'
              : 'Generating thumbnail...',
        })
      }, context === 'story' ? 'reel' : 'chat')

      compressedFile = new File([result.videoBlob], file.name.replace(/\.[^.]+$/, '.mp4'), {
        type: 'video/mp4',
      })
      thumbnailFile = new File([result.thumbnailBlob], 'thumbnail.webp', {
        type: 'image/webp',
      })
      width = result.width
      height = result.height
      duration = result.duration
    }
  }

  onProgress?.({ percent: 75, stage: 'uploading', message: 'Uploading...' })

  let result: UploadResult

  if (isNativePlatform()) {
    result = await uploadDirect(compressedFile, thumbnailFile, mediaType, width, height, duration, originalSize)
  } else {
    result = await uploadViaApi(compressedFile, thumbnailFile, mediaType, width, height, duration, originalSize)
  }

  onProgress?.({ percent: 100, stage: 'done', message: 'Done!' })

  return result
}

async function uploadDirect(
  file: File,
  thumbnailFile: File | undefined,
  mediaType: MediaType,
  width: number | undefined,
  height: number | undefined,
  duration: number | undefined,
  originalSize: number
): Promise<UploadResult> {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')

  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const ext = mediaType === 'video' ? 'mp4' : 'webp'
  const bucket = mediaType === 'video' ? 'videos' : 'images'
  const storagePath = `${user.id}/${timestamp}-${random}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, {
      cacheControl: '31536000',
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) throw new Error('Upload failed')

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath)

  let thumbnailUrl: string | undefined
  if (thumbnailFile) {
    const thumbPath = `${user.id}/${timestamp}-${random}-thumb.webp`
    const { error: thumbError } = await supabase.storage
      .from('images')
      .upload(thumbPath, thumbnailFile, {
        cacheControl: '31536000',
        upsert: false,
        contentType: 'image/webp',
      })
    if (!thumbError) {
      const { data: thumbUrlData } = supabase.storage.from('images').getPublicUrl(thumbPath)
      thumbnailUrl = thumbUrlData.publicUrl
    }
  }

  const { data: mediaRow, error: insertError } = await supabase
    .from('media')
    .insert({
      user_id: user.id,
      type: mediaType,
      storage_layer: 'supabase',
      storage_path: storagePath,
      url: urlData.publicUrl,
      thumbnail_url: thumbnailUrl,
      original_size: originalSize || file.size,
      compressed_size: file.size,
      width: width || null,
      height: height || null,
      duration: duration || null,
      format: ext,
      mime_type: file.type,
    })
    .select()
    .single()

  if (insertError || !mediaRow) throw new Error('Failed to save media metadata')

  return {
    id: mediaRow.id,
    url: urlData.publicUrl,
    thumbnailUrl,
    width,
    height,
    duration,
    format: ext,
    originalSize: originalSize || file.size,
    compressedSize: file.size,
  }
}

async function uploadViaApi(
  file: File,
  thumbnailFile: File | undefined,
  mediaType: MediaType,
  width: number | undefined,
  height: number | undefined,
  duration: number | undefined,
  originalSize: number
): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  if (thumbnailFile) formData.append('thumbnail', thumbnailFile)
  formData.append('type', mediaType)
  if (width) formData.append('width', String(width))
  if (height) formData.append('height', String(height))
  if (duration) formData.append('duration', String(duration))
  formData.append('originalSize', String(originalSize))

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    if (response.status === 429) {
      throw new RateLimitError(data.error || 'Too many uploads', data.retryAfterSec || 60)
    }
    throw new Error(data.error || `Upload failed (${response.status})`)
  }

  const result = await response.json()
  if (!result.url) {
    throw new Error('Upload succeeded but no URL returned')
  }
  return result
}

export async function uploadMultipleMedia(
  files: File[],
  onProgress?: (fileIndex: number, progress: UploadProgress) => void,
  context: 'post' | 'story' | 'message' | 'avatar' = 'post'
): Promise<UploadResult[]> {
  const results: UploadResult[] = []

  for (let i = 0; i < files.length; i++) {
    const result = await uploadMedia(files[i], (progress) => {
      onProgress?.(i, progress)
    }, context)
    results.push(result)
  }

  return results
}
