/**
 * Media upload pipeline
 * Handles compression + upload to API route
 */

import { compressImage } from './image-compress'
import { compressVideo, validateVideo, getVideoDuration, type VideoProgress } from './video-compress'

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

function getMediaType(file: File): MediaType {
  if (file.type.startsWith('video/')) return 'video'
  return 'image'
}

export async function uploadMedia(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  context: 'post' | 'story' | 'message' | 'avatar' = 'post'
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
    onProgress?.({ percent: 10, stage: 'compressing', message: 'Compressing image...' })

    const result = await compressImage(file)
    compressedFile = new File([result.blob], file.name.replace(/\.[^.]+$/, '.webp'), {
      type: 'image/webp',
    })
    width = result.width
    height = result.height
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

  onProgress?.({ percent: 75, stage: 'uploading', message: 'Uploading...' })

  // Upload via API
  const formData = new FormData()
  formData.append('file', compressedFile)
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
    throw new Error(data.error || 'Upload failed')
  }

  const result: UploadResult = await response.json()

  onProgress?.({ percent: 100, stage: 'done', message: 'Done!' })

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
