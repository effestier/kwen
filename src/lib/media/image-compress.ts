/**
 * Client-side image compression utility
 * Converts images to WebP with quality fallbacks
 */

export interface CompressResult {
  blob: Blob
  width: number
  height: number
  originalSize: number
  compressedSize: number
  format: string
  skipped: boolean
}

const MAX_DIMENSION = 1920
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB target
const MIN_QUALITY = 0.5
const QUALITY_STEPS = [0.8, 0.7, 0.6]
const SKIP_COMPRESSION_BELOW = 100 * 1024 // 100KB

// Types that should skip compression
const SKIP_TYPES = ['image/gif', 'image/svg+xml']

export async function compressImage(file: File): Promise<CompressResult> {
  const originalSize = file.size

  // Skip small files
  if (originalSize < SKIP_COMPRESSION_BELOW) {
    const bitmap = await createImageBitmap(file)
    return {
      blob: file,
      width: bitmap.width,
      height: bitmap.height,
      originalSize,
      compressedSize: originalSize,
      format: file.type.split('/')[1] || 'unknown',
      skipped: true,
    }
  }

  // Skip GIF and SVG (no useful compression)
  if (SKIP_TYPES.includes(file.type)) {
    const bitmap = await createImageBitmap(file)
    return {
      blob: file,
      width: bitmap.width,
      height: bitmap.height,
      originalSize,
      compressedSize: originalSize,
      format: file.type.split('/')[1] || 'unknown',
      skipped: true,
    }
  }

  // Load image into bitmap
  const bitmap = await createImageBitmap(file)

  // Calculate resized dimensions
  const { width, height } = calculateDimensions(bitmap.width, bitmap.height)

  // Try compression at each quality level
  for (const quality of QUALITY_STEPS) {
    const blob = await canvasToWebP(bitmap, width, height, quality)
    if (blob.size <= MAX_FILE_SIZE) {
      return {
        blob,
        width,
        height,
        originalSize,
        compressedSize: blob.size,
        format: 'webp',
        skipped: false,
      }
    }
  }

  // If still too large, reduce dimensions and try again
  const smallerDims = calculateDimensions(bitmap.width, bitmap.height, 1280)
  const blob = await canvasToWebP(bitmap, smallerDims.width, smallerDims.height, MIN_QUALITY)

  if (blob.size <= MAX_FILE_SIZE) {
    return {
      blob,
      width: smallerDims.width,
      height: smallerDims.height,
      originalSize,
      compressedSize: blob.size,
      format: 'webp',
      skipped: false,
    }
  }

  // Last resort: return the smallest we got
  return {
    blob,
    width: smallerDims.width,
    height: smallerDims.height,
    originalSize,
    compressedSize: blob.size,
    format: 'webp',
    skipped: false,
  }
}

function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDim: number = MAX_DIMENSION
): { width: number; height: number } {
  if (originalWidth <= maxDim && originalHeight <= maxDim) {
    return { width: originalWidth, height: originalHeight }
  }

  const ratio = Math.min(maxDim / originalWidth, maxDim / originalHeight)
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio),
  }
}

function canvasToWebP(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Failed to get canvas context'))
      return
    }

    ctx.drawImage(bitmap, 0, 0, width, height)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to compress image'))
        }
      },
      'image/webp',
      quality
    )
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getCompressionPercent(original: number, compressed: number): number {
  if (original === 0) return 0
  return Math.round((1 - compressed / original) * 100)
}
