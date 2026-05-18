'use server';

import { createClient } from '@/lib/supabase/server';

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  user: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export async function getComments(postId: string, limit = 50): Promise<Comment[]> {
  try {
    const supabase = await createClient();

    if (!postId || typeof postId !== 'string') {
      return [];
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);

    const { data: comments, error } = await supabase
      .from('comments')
      .select(`
        id,
        post_id,
        user_id,
        content,
        parent_id,
        created_at,
        user:profiles!inner(
          username,
          display_name,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(safeLimit);

    if (error) {
      return [];
    }

    return (comments || []) as unknown as Comment[];
  } catch {
    return [];
  }
}

export async function addComment(postId: string, content: string): Promise<{ success: boolean; error?: string; comment?: Comment }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!postId || typeof postId !== 'string') {
      return { success: false, error: 'Invalid post ID' };
    }

    const cleanContent = content.trim().slice(0, 2000);

    if (!cleanContent) {
      return { success: false, error: 'Comment cannot be empty' };
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        content: cleanContent,
      })
      .select(`
        id,
        post_id,
        user_id,
        content,
        parent_id,
        created_at,
        user:profiles!inner(
          username,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      return { success: false, error: 'Failed to add comment' };
    }

    return { success: true, comment: comment as unknown as Comment };
  } catch {
    return { success: false, error: 'Failed to add comment' };
  }
}

export async function deleteComment(commentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!commentId || typeof commentId !== 'string') {
      return { success: false, error: 'Invalid comment ID' };
    }

    const { error } = await supabase
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: 'Failed to delete comment' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete comment' };
  }
}

export async function getCommentCount(postId: string): Promise<number> {
  try {
    const supabase = await createClient();

    if (!postId || typeof postId !== 'string') {
      return 0;
    }

    const { count, error } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)
      .is('deleted_at', null);

    if (error) {
      return 0;
    }

    return count || 0;
  } catch {
    return 0;
  }
}
