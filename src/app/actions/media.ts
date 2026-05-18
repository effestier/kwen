'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm']

function isValidMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Must be from Supabase storage
    return parsed.hostname.endsWith('.supabase.co') || parsed.hostname.endsWith('.supabase.in')
  } catch {
    return false
  }
}

export async function uploadAvatar(filePath: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    if (!filePath || !isValidMediaUrl(filePath)) {
      return { error: 'Invalid file path' }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: filePath, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      return { error: 'Failed to update avatar' }
    }

    revalidatePath('/profile')
    revalidatePath('/settings')
    return { success: true, url: filePath }
  } catch {
    return { error: 'Failed to upload avatar' }
  }
}

export async function uploadPostMedia(postId: string, urls: string[]) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    if (!postId || typeof postId !== 'string') {
      return { error: 'Invalid post ID' }
    }

    if (!Array.isArray(urls) || urls.length === 0 || urls.length > 10) {
      return { error: 'Invalid media count' }
    }

    // Validate all URLs
    for (const url of urls) {
      if (!isValidMediaUrl(url)) {
        return { error: 'Invalid media URL' }
      }
    }

    // Verify post ownership
    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single()

    if (!post || post.user_id !== user.id) {
      return { error: 'Unauthorized' }
    }

    const mediaRecords = urls.map((url, index) => ({
      post_id: postId,
      storage_path: url,
      media_type: 'image',
      sort_order: index,
    }))

    const { error } = await supabase
      .from('post_media')
      .insert(mediaRecords)

    if (error) {
      return { error: 'Failed to save media' }
    }

    revalidatePath('/feed')
    return { success: true }
  } catch {
    return { error: 'Failed to upload media' }
  }
}

export async function deletePostMedia(mediaId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    if (!mediaId || typeof mediaId !== 'string') {
      return { error: 'Invalid media ID' }
    }

    // Get media and verify ownership
    const { data: media } = await supabase
      .from('post_media')
      .select('post_id, storage_path')
      .eq('id', mediaId)
      .single()

    if (!media) {
      return { error: 'Media not found' }
    }

    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', media.post_id)
      .single()

    if (!post || post.user_id !== user.id) {
      return { error: 'Unauthorized' }
    }

    // Delete from storage (non-blocking)
    await supabase.storage.from('posts').remove([media.storage_path])

    // Delete from database
    const { error } = await supabase
      .from('post_media')
      .delete()
      .eq('id', mediaId)

    if (error) {
      return { error: 'Failed to delete media' }
    }

    return { success: true }
  } catch {
    return { error: 'Failed to delete media' }
  }
}

export async function createPostWithMedia(formData: FormData) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    const content = (formData.get('content') as string | null)?.trim().slice(0, 5000) || null
    const location = (formData.get('location') as string | null)?.trim().slice(0, 200) || null
    const mediaUrlsRaw = formData.get('mediaUrls') as string | null

    if (!content && !mediaUrlsRaw) {
      return { error: 'Post must have content or images' }
    }

    let mediaUrl: string | null = null
    let urls: string[] = []

    if (mediaUrlsRaw) {
      try {
        urls = JSON.parse(mediaUrlsRaw) as string[]
        if (!Array.isArray(urls) || urls.length > 10) {
          return { error: 'Too many media files' }
        }
        // Validate URLs
        for (const url of urls) {
          if (!isValidMediaUrl(url)) {
            return { error: 'Invalid media URL' }
          }
        }
        if (urls.length > 0) {
          mediaUrl = urls[0]
        }
      } catch {
        return { error: 'Invalid media data' }
      }
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        content,
        location,
        media_url: mediaUrl,
      })
      .select()
      .single()

    if (postError) {
      return { error: 'Failed to create post' }
    }

    // Add media to post_media table
    if (urls.length > 0) {
      const mediaRecords = urls.map((url, index) => ({
        post_id: post.id,
        storage_path: url,
        media_type: 'image',
        sort_order: index,
      }))

      await supabase.from('post_media').insert(mediaRecords)
    }

    revalidatePath('/feed')
    return { success: true, postId: post.id }
  } catch {
    return { error: 'Failed to create post' }
  }
}

export async function uploadStory(mediaUrl: string, mediaType: string = 'image') {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    if (!isValidMediaUrl(mediaUrl)) {
      return { error: 'Invalid media URL' }
    }

    const validTypes = ['image', 'video']
    const cleanType = validTypes.includes(mediaType) ? mediaType : 'image'

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const { data, error } = await supabase
      .from('stories')
      .insert({
        user_id: user.id,
        media_url: mediaUrl,
        media_type: cleanType,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (error) {
      // Retry without media_type column
      const { data: retryData, error: retryError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          media_url: mediaUrl,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      if (retryError) {
        return { error: 'Failed to upload story' }
      }

      revalidatePath('/feed')
      return { success: true, storyId: retryData?.id }
    }

    revalidatePath('/feed')
    return { success: true, storyId: data?.id }
  } catch {
    return { error: 'Failed to upload story' }
  }
}
