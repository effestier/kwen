import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60 // 60 seconds for large uploads

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

export async function POST(request: NextRequest) {
  try {
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

    // Generate unique path
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const ext = type === 'video' ? 'mp4' : 'webp'
    const bucket = type === 'video' ? 'videos' : 'images'
    const storagePath = `${user.id}/${timestamp}-${random}.${ext}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, {
        cacheControl: '31536000', // 1 year cache
        upsert: false,
        contentType: file.type,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
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
        mime_type: file.type,
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB error:', dbError)
      // Don't fail - file is uploaded, just log the error
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
