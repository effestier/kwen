'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function uploadAvatar(filePath: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Update profile with new avatar URL
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: filePath, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/profile')
  revalidatePath('/settings')
  return { success: true, url: filePath }
}

export async function uploadPostMedia(postId: string, urls: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Verify post ownership
  const { data: post } = await supabase
    .from('posts')
    .select('user_id')
    .eq('id', postId)
    .single()

  if (!post || post.user_id !== user.id) {
    return { error: 'Post not found or unauthorized' }
  }

  // Insert media records
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
    return { error: error.message }
  }

  revalidatePath('/feed')
  return { success: true }
}

export async function deletePostMedia(mediaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
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

  // Get post to verify ownership
  const { data: post } = await supabase
    .from('posts')
    .select('user_id')
    .eq('id', media.post_id)
    .single()

  if (!post || post.user_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('posts')
    .remove([media.storage_path])

  if (storageError) {
    // Continue even if storage delete fails
    console.error('Storage delete error:', storageError)
  }

  // Delete from database
  const { error } = await supabase
    .from('post_media')
    .delete()
    .eq('id', mediaId)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function createPostWithMedia(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const content = formData.get('content') as string | null
  const location = formData.get('location') as string | null
  const mediaUrls = formData.get('mediaUrls') as string // JSON string of array

  // Validate content or media
  if (!content && !mediaUrls) {
    return { error: 'Post must have content or images' }
  }

  // Parse media URLs
  let mediaUrl: string | null = null
  if (mediaUrls) {
    const urls = JSON.parse(mediaUrls) as string[]
    if (urls.length > 0) {
      mediaUrl = urls[0] // Store first image URL in posts.media_url
    }
  }

  console.log('[POST_CREATE] Creating post:', { content, location, mediaUrl })

  // Create post with media_url
  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      content,
      location: location || null,
      media_url: mediaUrl,
    })
    .select()
    .single()

  if (postError) {
    console.error('[POST_CREATE] Post insert error:', postError)
    return { error: postError.message }
  }

  console.log('[POST_CREATE] Post created:', post.id)

  // Add media to post_media table for additional images
  if (mediaUrls) {
    const urls = JSON.parse(mediaUrls) as string[]
    const mediaRecords = urls.map((url, index) => ({
      post_id: post.id,
      storage_path: url,
      media_type: 'image',
      sort_order: index,
    }))

    const { error: mediaError } = await supabase
      .from('post_media')
      .insert(mediaRecords)

    if (mediaError) {
      console.error('[POST_CREATE] Media insert error:', mediaError)
    }
  }

  revalidatePath('/feed')
  return { success: true, postId: post.id }
}

export async function uploadStory(mediaUrl: string, mediaType: string = 'image') {
  console.log('[UPLOAD_STORY] Starting:', { mediaUrl, mediaType });

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  console.log('[UPLOAD_STORY] Auth user:', user?.id);

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Stories expire in 24 hours
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 24)

  console.log('[UPLOAD_STORY] Insert payload:', {
    user_id: user.id,
    media_url: mediaUrl,
    expires_at: expiresAt.toISOString(),
  });

  // Try insert WITH media_type first
  const { data, error } = await supabase
    .from('stories')
    .insert({
      user_id: user.id,
      media_url: mediaUrl,
      media_type: mediaType,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  console.log('[UPLOAD_STORY] Insert result with media_type:', { data, error });

  // If error, try WITHOUT media_type column (for tables without this column)
  if (error) {
    console.log('[UPLOAD_STORY] Retrying without media_type column');

    const { data: retryData, error: retryError } = await supabase
      .from('stories')
      .insert({
        user_id: user.id,
        media_url: mediaUrl,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    console.log('[UPLOAD_STORY] Retry result:', { data: retryData, error: retryError });

    if (retryError) {
      console.error('[UPLOAD_STORY] Retry error:', retryError);
      return { error: retryError.message }
    }

    revalidatePath('/feed')
    return { success: true, storyId: retryData?.id }
  }

  revalidatePath('/feed')
  return { success: true, storyId: data?.id }
}