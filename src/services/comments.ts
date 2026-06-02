import { createClient } from '@/lib/supabase/client';

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
  reply_count?: number;
  like_count?: number;
  is_liked?: boolean;
}

export async function getComments(postId: string, limit = 50): Promise<Comment[]> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!postId || typeof postId !== 'string') return [];

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
        user:profiles!inner(username, display_name, avatar_url)
      `)
      .eq('post_id', postId)
      .is('parent_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(safeLimit);

    if (error || !comments) return [];

    const commentIds = comments.map(c => c.id);

    const [replyCountsRes, likeCountsRes, userLikesRes] = await Promise.all([
      supabase.from('comments').select('parent_id').in('parent_id', commentIds).is('deleted_at', null),
      supabase.from('comment_likes').select('comment_id').in('comment_id', commentIds),
      user ? supabase.from('comment_likes').select('comment_id').eq('user_id', user.id).in('comment_id', commentIds) : Promise.resolve({ data: [] }),
    ]);

    const replyCountMap = new Map<string, number>();
    replyCountsRes.data?.forEach(r => {
      replyCountMap.set(r.parent_id!, (replyCountMap.get(r.parent_id!) || 0) + 1);
    });

    const likeCountMap = new Map<string, number>();
    likeCountsRes.data?.forEach(l => {
      likeCountMap.set(l.comment_id, (likeCountMap.get(l.comment_id) || 0) + 1);
    });

    const userLikes = new Set(userLikesRes.data?.map(l => l.comment_id) || []);

    return comments.map(c => ({
      ...c,
      reply_count: replyCountMap.get(c.id) || 0,
      like_count: likeCountMap.get(c.id) || 0,
      is_liked: userLikes.has(c.id),
    })) as unknown as Comment[];
  } catch {
    return [];
  }
}

export async function getReplies(parentId: string, limit = 20): Promise<Comment[]> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!parentId) return [];

    const { data: replies, error } = await supabase
      .from('comments')
      .select(`
        id,
        post_id,
        user_id,
        content,
        parent_id,
        created_at,
        user:profiles!inner(username, display_name, avatar_url)
      `)
      .eq('parent_id', parentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error || !replies) return [];

    const replyIds = replies.map(r => r.id);

    const { data: likeCounts } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .in('comment_id', replyIds);

    const likeCountMap = new Map<string, number>();
    likeCounts?.forEach(l => {
      likeCountMap.set(l.comment_id, (likeCountMap.get(l.comment_id) || 0) + 1);
    });

    let userLikes = new Set<string>();
    if (user) {
      const { data: likes } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', replyIds);
      userLikes = new Set(likes?.map(l => l.comment_id) || []);
    }

    return replies.map(r => ({
      ...r,
      reply_count: 0,
      like_count: likeCountMap.get(r.id) || 0,
      is_liked: userLikes.has(r.id),
    })) as unknown as Comment[];
  } catch {
    return [];
  }
}

export async function addComment(
  postId: string,
  content: string,
  parentId?: string
): Promise<{ success: boolean; error?: string; comment?: Comment }> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Not authenticated' };
    if (!postId || typeof postId !== 'string') return { success: false, error: 'Invalid post ID' };

    const cleanContent = content.trim().slice(0, 2000);
    if (!cleanContent) return { success: false, error: 'Comment cannot be empty' };

    const insertData: Record<string, unknown> = {
      post_id: postId,
      user_id: user.id,
      content: cleanContent,
    };

    if (parentId) {
      insertData.parent_id = parentId;
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert(insertData)
      .select(`
        id,
        post_id,
        user_id,
        content,
        parent_id,
        created_at,
        user:profiles!inner(username, display_name, avatar_url)
      `)
      .single();

    if (error) return { success: false, error: 'Failed to add comment' };

    // Extract and send mention notifications
    const mentions = cleanContent.match(/@[\w.]+/g)
    if (mentions && mentions.length > 0) {
      const usernames = [...new Set(mentions.map(m => m.slice(1).toLowerCase()))]
      const { data: mentionedProfiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('username', usernames)

      if (mentionedProfiles && mentionedProfiles.length > 0) {
        const otherMentions = mentionedProfiles.filter(p => p.id !== user.id)
        if (otherMentions.length > 0) {
          const notifications = otherMentions.map(p => ({
            user_id: p.id,
            type: 'mention' as const,
            actor_id: user.id,
            post_id: postId,
            comment_id: comment.id,
            is_read: false,
          }))
          await supabase.from('notifications').insert(notifications)
        }
      }
    }

    return {
      success: true,
      comment: { ...comment, reply_count: 0, like_count: 0, is_liked: false } as unknown as Comment,
    };
  } catch {
    return { success: false, error: 'Failed to add comment' };
  }
}

export async function toggleCommentLike(commentId: string): Promise<{ success: boolean; liked?: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Not authenticated' };
    if (!commentId) return { success: false, error: 'Invalid comment ID' };

    const { data: existing } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('comment_likes').delete().eq('id', existing.id);
      return { success: true, liked: false };
    } else {
      const { error } = await supabase
        .from('comment_likes')
        .insert({ comment_id: commentId, user_id: user.id });
      if (error) return { success: false, error: 'Failed to like comment' };
      return { success: true, liked: true };
    }
  } catch {
    return { success: false, error: 'Failed to process like' };
  }
}

export async function deleteComment(commentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Not authenticated' };
    if (!commentId) return { success: false, error: 'Invalid comment ID' };

    const { error } = await supabase
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) return { success: false, error: 'Failed to delete comment' };
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete comment' };
  }
}

export async function getCommentCount(postId: string): Promise<number> {
  try {
    const supabase = createClient();

    if (!postId) return 0;

    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)
      .is('deleted_at', null);

    return count || 0;
  } catch {
    return 0;
  }
}
