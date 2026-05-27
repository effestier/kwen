/**
 * Client-side video compression using FFmpeg.wasm
 * Lazy loads FFmpeg (~30MB) only when needed
 */

import type { FFmpeg } from '@ffmpeg/ffmpeg'

export interface VideoCompressResult {
  videoBlob: Blob
  thumbnailBlob: Blob
  width: number
  height: number
  duration: number
  originalSize: number
  compressedSize: number
  thumbnailSize: number
  format: string
}

export interface VideoProgress {
  percent: number
  stage: 'loading' | 'compressing' | 'thumbnail' | 'done'
}

const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB
const MAX_DURATION_REEL = 60 // 60 seconds for reels
const MAX_DURATION_CHAT = 300 // 5 minutes for chat
const TARGET_RESOLUTION = 720
const MAX_COMPRESSED_SIZE = 50 * 1024 * 1024 // 50MB target

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoading = false

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (ffmpegLoading) {
    // Wait for existing load with timeout
    const waitStart = Date.now()
    while (ffmpegLoading) {
      if (Date.now() - waitStart > 60000) throw new Error('FFmpeg load timeout')
      await new Promise((r) => setTimeout(r, 200))
    }
    if (ffmpegInstance) return ffmpegInstance
  }

  ffmpegLoading = true
  try {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { toBlobURL } = await import('@ffmpeg/util')

    const ffmpeg = new FFmpeg()

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    ffmpegInstance = ffmpeg
    return ffmpeg
  } finally {
    ffmpegLoading = false
  }
}

export function validateVideo(file: File, context: 'reel' | 'chat' = 'reel'): string | null {
  const baseType = file.type.split(';')[0].trim()
  const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime']
  if (!allowedTypes.includes(baseType)) {
    return 'Invalid video format. Allowed: MP4, WebM, MOV'
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return `Video too large. Maximum size is ${MAX_VIDEO_SIZE / (1024 * 1024)}MB`
  }

  return null
}

export async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(video.src)
      reject(new Error('Video metadata load timeout'))
    }, 15000)

    video.onloadedmetadata = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(video.src)
      resolve(video.duration)
    }

    video.onerror = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(video.src)
      reject(new Error('Failed to load video metadata'))
    }

    video.src = URL.createObjectURL(file)
  })
}

export async function compressVideo(
  file: File,
  onProgress?: (progress: VideoProgress) => void,
  context: 'reel' | 'chat' = 'reel'
): Promise<VideoCompressResult> {
  const originalSize = file.size

  // Validate
  const validationError = validateVideo(file, context)
  if (validationError) throw new Error(validationError)

  // Check duration
  const duration = await getVideoDuration(file)
  const maxDuration = context === 'reel' ? MAX_DURATION_REEL : MAX_DURATION_CHAT
  if (duration > maxDuration) {
    throw new Error(`Video too long. Maximum ${context === 'reel' ? '60 seconds' : '5 minutes'}`)
  }

  onProgress?.({ percent: 0, stage: 'loading' })

  // Load FFmpeg
  const ffmpeg = await loadFFmpeg()

  onProgress?.({ percent: 10, stage: 'compressing' })

  // Write input file
  const { fetchFile } = await import('@ffmpeg/util')
  const inputData = await fetchFile(file)
  await ffmpeg.writeFile('input.mp4', inputData)

  // Get video dimensions to calculate output size
  const videoDims = await getVideoDimensions(file)
  const { width, height } = calculateVideoDimensions(videoDims.width, videoDims.height)

  // Compress video
  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    '-c:v', 'libx264',
    '-crf', '23',
    '-preset', 'fast',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '64k',
    '-ac', '1',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    'output.mp4',
  ])

  onProgress?.({ percent: 70, stage: 'thumbnail' })

  // Read compressed video
  const outputData = await ffmpeg.readFile('output.mp4')
  const videoBlob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: 'video/mp4' })

  // If still too large, try with higher CRF
  let finalBlob = videoBlob
  if (videoBlob.size > MAX_COMPRESSED_SIZE) {
    await ffmpeg.exec([
      '-i', 'input.mp4',
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v', 'libx264',
      '-crf', '26',
      '-preset', 'fast',
      '-r', '30',
      '-c:a', 'aac',
      '-b:a', '64k',
      '-ac', '1',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output2.mp4',
    ])
    const output2Data = await ffmpeg.readFile('output2.mp4')
    finalBlob = new Blob([new Uint8Array(output2Data as Uint8Array)], { type: 'video/mp4' })
  }

  // Generate thumbnail
  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-ss', '1',
    '-vframes', '1',
    '-vf', 'scale=640:-1',
    '-q:v', '5',
    'thumb.jpg',
  ])

  const thumbData = await ffmpeg.readFile('thumb.jpg')
  const thumbnailBlob = new Blob([new Uint8Array(thumbData as Uint8Array)], { type: 'image/jpeg' })

  // Cleanup
  await ffmpeg.deleteFile('input.mp4')
  await ffmpeg.deleteFile('output.mp4')
  try { await ffmpeg.deleteFile('output2.mp4') } catch {}
  await ffmpeg.deleteFile('thumb.jpg')

  onProgress?.({ percent: 100, stage: 'done' })

  return {
    videoBlob: finalBlob,
    thumbnailBlob,
    width,
    height,
    duration: Math.round(duration),
    originalSize,
    compressedSize: finalBlob.size,
    thumbnailSize: thumbnailBlob.size,
    format: 'mp4',
  }
}

function getVideoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(video.src)
      reject(new Error('Video dimensions load timeout'))
    }, 15000)

    video.onloadedmetadata = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(video.src)
      resolve({ width: video.videoWidth, height: video.videoHeight })
    }

    video.onerror = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(video.src)
      reject(new Error('Failed to load video metadata'))
    }

    video.src = URL.createObjectURL(file)
  })
}

function calculateVideoDimensions(
  originalWidth: number,
  originalHeight: number
): { width: number; height: number } {
  // Scale to fit within 720p while preserving aspect ratio
  if (originalWidth <= TARGET_RESOLUTION && originalHeight <= TARGET_RESOLUTION) {
    // Even if small, ensure dimensions are divisible by 2 (required for H.264)
    return {
      width: originalWidth % 2 === 0 ? originalWidth : originalWidth + 1,
      height: originalHeight % 2 === 0 ? originalHeight : originalHeight + 1,
    }
  }

  const ratio = Math.min(
    TARGET_RESOLUTION / originalWidth,
    TARGET_RESOLUTION / originalHeight
  )

  let width = Math.round(originalWidth * ratio)
  let height = Math.round(originalHeight * ratio)

  // Ensure divisible by 2
  if (width % 2 !== 0) width++
  if (height % 2 !== 0) height++

  return { width, height }
}

export function formatVideoSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
