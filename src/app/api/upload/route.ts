import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, UPLOAD_LIMIT } from '@/lib/rate-limit'

export const maxDuration = 300 // 5 min for large video uploads
export const dynamic = 'force-dynamic' // Never cache upload responses

// Note: In static export (APIK), native uploads directly to Supabase, bypassing this route

interface UploadResult {
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

// Magic byte signatures for allowed file types
const MAGIC_BYTES: Record<string, { mime: string; check: (buf: Uint8Array) => boolean }> = {
  jpeg: {
    mime: 'image/jpeg',
    check: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  },
  png: {
    mime: 'image/png',
    check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
  },
  gif: {
    mime: 'image/gif',
    check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  },
  webp: {
    mime: 'image/webp',
    check: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  mp4: {
    mime: 'video/mp4',
    check: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  },
  webm: {
    mime: 'video/webm',
    check: (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
  },
}

async function validateFileMagic(file: File, declaredType: 'image' | 'video'): Promise<{ valid: boolean; detectedMime?: string }> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())

  for (const [, spec] of Object.entries(MAGIC_BYTES)) {
    if (spec.check(header)) {
      // Verify the detected type matches the declared type
      const isVideo = spec.mime.startsWith('video/')
      if ((declaredType === 'video') !== isVideo) {
        return { valid: false, detectedMime: spec.mime }
      }
      return { valid: true, detectedMime: spec.mime }
    }
  }

  return { valid: false }
}

export async function POST(request: NextRequest) {
  try {
    // CSRF protection: verify Origin header matches our host
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    const host = request.headers.get('host')
    const isNativeApp = request.headers.get('x-capacitor-platform') !== null

    if (isNativeApp) {
      // Native app — no origin/referer, allow through
    } else if (origin) {
      try {
        const originUrl = new URL(origin)
        if (originUrl.host !== host) {
          return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
      }
    } else if (referer) {
      try {
        const refererUrl = new URL(referer)
        if (refererUrl.host !== host) {
          return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ error: 'Invalid referer' }, { status: 403 })
      }
    } else {
      // Browser request with no origin/referer — reject
      return NextResponse.json({ error: 'Missing origin header' }, { status: 403 })
    }

    const supabase = await createClient()

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const thumbnail = formData.get('thumbnail') as File | null
    const type = formData.get('type') as string | null
    const width = formData.get('width') as string | null
    const height = formData.get('height') as string | null
    const duration = formData.get('duration') as string | null
    const originalSize = formData.get('originalSize') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!type || !['image', 'video'].includes(type)) {
      return NextResponse.json({ error: 'Invalid media type' }, { status: 400 })
    }

    // Validate file size
    const maxSize = type === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }

    // Validate file magic bytes — reject files that don't match declared type
    const magicResult = await validateFileMagic(file, type as 'image' | 'video')
    if (!magicResult.valid) {
      return NextResponse.json({ error: 'File content does not match declared type' }, { status: 400 })
    }

    // Validate thumbnail if provided
    if (thumbnail) {
      const thumbMagic = await validateFileMagic(thumbnail, 'image')
      if (!thumbMagic.valid) {
        return NextResponse.json({ error: 'Invalid thumbnail format' }, { status: 400 })
      }
    }

    // Rate limit: AFTER validation — only valid uploads consume quota
    // failOpen: allow uploads even if rate limiter is unavailable (RPC down, etc.)
    const limit = await checkRateLimit(`upload:${user.id}`, UPLOAD_LIMIT, true)
    if (!limit.allowed) {
      const retryAfterSec = Math.ceil((limit.retryAfterMs || 0) / 1000)
      return NextResponse.json(
        { error: 'Too many uploads. Please wait.', retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      )
    }

    // Generate unique path
    const timestamp = Date.now()
    const random = crypto.randomUUID().replace(/-/g, '').substring(0, 12)
    const ext = type === 'video' ? 'mp4' : 'webp'
    const bucket = type === 'video' ? 'videos' : 'images'
    const storagePath = `${user.id}/${timestamp}-${random}.${ext}`

    // Upload to Supabase Storage with validated content type
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, {
        cacheControl: '31536000', // 1 year cache
        upsert: false,
        contentType: magicResult.detectedMime || file.type,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError.message ?? uploadError)
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath)

    // Upload thumbnail if provided
    let thumbnailUrl: string | undefined
    if (thumbnail) {
      const thumbPath = `${user.id}/${timestamp}-${random}-thumb.webp`
      const { error: thumbError } = await supabase.storage
        .from('images')
        .upload(thumbPath, thumbnail, {
          cacheControl: '31536000',
          upsert: false,
          contentType: 'image/webp',
        })

      if (!thumbError) {
        const { data: thumbUrlData } = supabase.storage
          .from('images')
          .getPublicUrl(thumbPath)
        thumbnailUrl = thumbUrlData.publicUrl
      }
    }

    // Save to media table
    const { data: mediaRow, error: dbError } = await supabase
      .from('media')
      .insert({
        user_id: user.id,
        type,
        storage_layer: 'supabase',
        storage_path: storagePath,
        url: urlData.publicUrl,
        thumbnail_url: thumbnailUrl,
        original_size: originalSize ? parseInt(originalSize) : file.size,
        compressed_size: file.size,
        width: width ? parseInt(width) : null,
        height: height ? parseInt(height) : null,
        duration: duration ? parseInt(duration) : null,
        format: ext,
        mime_type: magicResult.detectedMime || file.type,
      })
      .select()
      .single()

    if (dbError) {
      console.error('Media table insert error:', dbError.message ?? dbError)
      // Don't fail — file is uploaded, just log the error
    }

    const result: UploadResult = {
      id: mediaRow?.id || '',
      url: urlData.publicUrl,
      thumbnailUrl,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      duration: duration ? parseInt(duration) : undefined,
      format: ext,
      originalSize: originalSize ? parseInt(originalSize) : file.size,
      compressedSize: file.size,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
