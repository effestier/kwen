'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const content = formData.get('content') as string | null
  const location = formData.get('location') as string | null

  // Validation: content OR media must be provided
  // Media handling would be done separately
  if (!content) {
    return { error: 'Post must have content' }
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      content,
      location: location || null,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/feed')
  return { success: true, postId: data.id }
}

export async function deletePost(postId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('posts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('user_id', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/feed')
  return { success: true }
}

export async function togglePostLike(postId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
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

    // Create notification for unlike? No, just remove
  } else {
    // Like
    await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: user.id })

    // Create notification (don't notify self)
    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single()

    if (post && post.user_id !== user.id) {
      await supabase
        .from('notifications')
        .insert({
          user_id: post.user_id,
          type: 'like',
          actor_id: user.id,
          post_id: postId,
        })
    }
  }

  revalidatePath('/feed')
  return { success: true }
}

export async function togglePostSave(postId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: existing } = await supabase
    .from('saved_posts')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    await supabase
      .from('saved_posts')
      .delete()
      .eq('id', existing.id)
  } else {
    await supabase
      .from('saved_posts')
      .insert({ post_id: postId, user_id: user.id })
  }

  revalidatePath('/feed')
  return { success: true }
}

export async function createComment(postId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      user_id: user.id,
      content,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Create notification
  const { data: post } = await supabase
    .from('posts')
    .select('user_id')
    .eq('id', postId)
    .single()

  if (post && post.user_id !== user.id) {
    await supabase
      .from('notifications')
      .insert({
        user_id: post.user_id,
        type: 'comment',
        actor_id: user.id,
        post_id: postId,
        comment_id: data.id,
      })
  }

  revalidatePath('/feed')
  return { success: true, commentId: data.id }
}

export async function deleteComment(commentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('user_id', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/feed')
  return { success: true }
}

export async function toggleCommentLike(commentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: existing } = await supabase
    .from('comment_likes')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    await supabase
      .from('comment_likes')
      .delete()
      .eq('id', existing.id)
  } else {
    await supabase
      .from('comment_likes')
      .insert({ comment_id: commentId, user_id: user.id })
  }

  revalidatePath('/feed')
  return { success: true }
}