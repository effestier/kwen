import { createClient } from '@/lib/supabase/client'

export type UploadType = 'avatar' | 'post' | 'story' | 'message'

export interface UploadConfig {
  bucket: string
  folder: string
  maxSize: number
  allowedTypes: string[]
  allowedExtensions: string[]
}

export const UPLOAD_CONFIGS: Record<UploadType, UploadConfig> = {
  avatar: {
    bucket: 'avatars',
    folder: 'avatars',
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  },
  post: {
    bucket: 'posts',
    folder: 'posts',
    maxSize: 100 * 1024 * 1024, // 100MB (videos)
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov'],
  },
  story: {
    bucket: 'stories',
    folder: 'stories',
    maxSize: 200 * 1024 * 1024, // 200MB for stories (videos)
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm', 'mov'],
  },
  message: {
    bucket: 'messages',
    folder: 'messages',
    maxSize: 10 * 1024 * 1024, // 10MB for message images
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  },
}

export interface UploadResult {
  path: string
  url: string
  error?: string
}

export function validateFile(file: File, type: UploadType): string | null {
  const config = UPLOAD_CONFIGS[type]

  // Check file size
  if (file.size > config.maxSize) {
    const maxMB = config.maxSize / (1024 * 1024)
    return `File too large. Maximum size is ${maxMB}MB`
  }

  // Zero-byte check
  if (file.size === 0) {
    return 'Empty file not allowed'
  }

  // Check file type (MIME)
  if (!config.allowedTypes.includes(file.type)) {
    return `Invalid file type. Allowed: ${config.allowedExtensions.join(', ')}`
  }

  // Check extension
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext && !config.allowedExtensions.includes(ext)) {
    return `Invalid file extension. Allowed: ${config.allowedExtensions.join(', ')}`
  }

  // Reject executable extensions (check each extension segment, not substring)
  const dangerousExts = new Set(['exe', 'bat', 'cmd', 'sh', 'ps1', 'js', 'mjs', 'html', 'htm', 'svg', 'php', 'py', 'rb'])
  const parts = file.name.toLowerCase().split('.')
  for (let i = 1; i < parts.length; i++) {
    if (dangerousExts.has(parts[i])) return 'File type not allowed'
  }

  return null
}

export function generateFileName(originalName: string, userId: string): string {
  const ext = originalName.split('.').pop() || 'jpg'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${userId}/${timestamp}-${random}.${ext}`
}

export async function uploadFile(
  file: File,
  type: UploadType,
  userId: string
): Promise<UploadResult> {
  const supabase = createClient()
  const config = UPLOAD_CONFIGS[type]

  // Validate
  const validationError = validateFile(file, type)
  if (validationError) {
    return { path: '', url: '', error: validationError }
  }

  // Generate path
  const fileName = generateFileName(file.name, userId)

  // Upload
  const { data, error } = await supabase.storage
    .from(config.bucket)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) {
    return { path: '', url: '', error: error.message }
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(config.bucket)
    .getPublicUrl(fileName)

  return {
    path: fileName,
    url: urlData.publicUrl,
  }
}

export async function uploadMultipleFiles(
  files: File[],
  type: UploadType,
  userId: string
): Promise<UploadResult[]> {
  const results: UploadResult[] = []

  for (const file of files) {
    const result = await uploadFile(file, type, userId)
    results.push(result)
  }

  return results
}

export async function deleteFile(bucket: string, path: string): Promise<boolean> {
  const supabase = createClient()

  const { error } = await supabase.storage
    .from(bucket)
    .remove([path])

  return !error
}

export function getFilePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}