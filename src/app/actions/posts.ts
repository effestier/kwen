'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleLike(postId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    if (!postId || typeof postId !== 'string') {
      return { error: 'Invalid post ID' }
    }

    // Check if already liked
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      // Unlike
      await supabase
        .from('post_likes')
        .delete()
        .eq('id', existing.id)

      return { success: true, liked: false }
    } else {
      // Like
      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: user.id })

      if (error) {
        return { error: 'Failed to like post' }
      }

      return { success: true, liked: true }
    }
  } catch {
    return { error: 'Failed to process like' }
  }
}

export async function toggleSave(postId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    if (!postId || typeof postId !== 'string') {
      return { error: 'Invalid post ID' }
    }

    // Check if already saved
    const { data: existing } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      // Unsave
      await supabase
        .from('saved_posts')
        .delete()
        .eq('id', existing.id)

      return { success: true, saved: false }
    } else {
      // Save
      const { error } = await supabase
        .from('saved_posts')
        .insert({ post_id: postId, user_id: user.id })

      if (error) {
        return { error: 'Failed to save post' }
      }

      return { success: true, saved: true }
    }
  } catch {
    return { error: 'Failed to process save' }
  }
}

export async function deletePost(postId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    if (!postId || typeof postId !== 'string') {
      return { error: 'Invalid post ID' }
    }

    // Verify ownership
    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single()

    if (!post || post.user_id !== user.id) {
      return { error: 'Unauthorized' }
    }

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)

    if (error) {
      return { error: 'Failed to delete post' }
    }

    revalidatePath('/feed')
    return { success: true }
  } catch {
    return { error: 'Failed to delete post' }
  }
}

export async function getPostLikes(postId: string) {
  try {
    const supabase = await createClient()

    const { count } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)

    return { count: count || 0 }
  } catch {
    return { count: 0 }
  }
}
