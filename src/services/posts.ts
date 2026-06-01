import { createClient } from '@/lib/supabase/client';

export async function toggleLike(postId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!postId || typeof postId !== 'string') return { error: 'Invalid post ID' };

    // M19: Check if liked, then act. Catch unique constraint on insert (TOCTOU safe).
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('post_likes').delete().eq('id', existing.id);
      return { success: true, liked: false };
    } else {
      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: user.id });

      if (error) {
        // M19: Unique constraint violation = concurrent insert already liked it
        if (error.code === '23505') return { success: true, liked: true };
        return { error: 'Failed to like post' };
      }
      return { success: true, liked: true };
    }
  } catch {
    return { error: 'Failed to process like' };
  }
}

export async function toggleSave(postId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!postId || typeof postId !== 'string') return { error: 'Invalid post ID' };

    const { data: existing } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('saved_posts').delete().eq('id', existing.id);
      return { success: true, saved: false };
    } else {
      const { error } = await supabase
        .from('saved_posts')
        .insert({ post_id: postId, user_id: user.id });

      if (error) {
        // M19: Unique constraint violation = concurrent insert already saved it
        if (error.code === '23505') return { success: true, saved: true };
        return { error: 'Failed to save post' };
      }
      return { success: true, saved: true };
    }
  } catch {
    return { error: 'Failed to process save' };
  }
}

export async function deletePost(postId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!postId || typeof postId !== 'string') return { error: 'Invalid post ID' };

    const { error } = await supabase.rpc('soft_delete_post', { p_post_id: postId });

    if (error) return { error: 'Failed to delete post' };
    return { success: true };
  } catch {
    return { error: 'Failed to delete post' };
  }
}

export async function restorePost(postId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase.rpc('restore_post', { p_post_id: postId });

    if (error) return { error: 'Failed to restore post' };
    return { success: true };
  } catch {
    return { error: 'Failed to restore post' };
  }
}

export async function incrementShareCount(postId: string) {
  try {
    const supabase = createClient();
    await supabase.rpc('increment_share_count', { p_post_id: postId });
  } catch {
    // Silent fail for share count
  }
}

export async function getPostLikes(postId: string) {
  try {
    const supabase = createClient();

    const { count } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    return { count: count || 0 };
  } catch {
    return { count: 0 };
  }
}

export async function getPost(postId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!postId || typeof postId !== 'string') return { error: 'Invalid post ID' };

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, content, location, created_at')
      .eq('id', postId)
      .is('deleted_at', null)
      .single();

    if (postError || !post) return { error: 'Post not found' };

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified')
      .eq('id', post.user_id)
      .single();

    const { data: media } = await supabase
      .from('post_media')
      .select('id, storage_path, media_type, sort_order')
      .eq('post_id', postId)
      .order('sort_order', { ascending: true });

    const { count: likeCount } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    const { count: commentCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)
      .is('deleted_at', null);

    let isLiked = false;
    let isSaved = false;

    if (user) {
      const [{ data: likedRow }, { data: savedRow }] = await Promise.all([
        supabase.from('post_likes').select('id').eq('post_id', postId).eq('user_id', user.id).maybeSingle(),
        supabase.from('saved_posts').select('id').eq('post_id', postId).eq('user_id', user.id).maybeSingle(),
      ]);
      isLiked = !!likedRow;
      isSaved = !!savedRow;
    }

    return {
      post: {
        id: post.id,
        content: post.content,
        location: post.location,
        createdAt: post.created_at,
        user: profile ? {
          id: profile.id,
          username: profile.username,
          displayName: profile.display_name,
          avatar: profile.avatar_url,
          isVerified: profile.is_verified,
        } : null,
        images: (media || []).map(m => m.storage_path),
        mediaType: (media || []).map(m => m.media_type),
        likes: likeCount || 0,
        comments: commentCount || 0,
        isLiked,
        isSaved,
      }
    };
  } catch {
    return { error: 'Failed to load post' };
  }
}

export async function blockUser(userId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!userId || userId === user.id) return { error: 'Invalid user' };

    const { error } = await supabase
      .from('blocks')
      .upsert({ blocker_id: user.id, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id' });

    if (error) return { error: 'Failed to block user' };
    return { success: true };
  } catch {
    return { error: 'Failed to block user' };
  }
}

export async function unblockUser(userId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };

    await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', userId);
    return { success: true };
  } catch {
    return { error: 'Failed to unblock user' };
  }
}

export async function getBlockedUsers() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { blocked: [], error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('blocks')
      .select('blocked_id, created_at')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) return { blocked: [] };

    const userIds = data.map(b => b.blocked_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const blocked = data.map(b => ({
      id: b.blocked_id,
      blocked_at: b.created_at,
      profile: profileMap.get(b.blocked_id) || null,
    }));

    return { blocked };
  } catch {
    return { blocked: [] };
  }
}

export async function muteUser(userId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!userId || userId === user.id) return { error: 'Invalid user' };

    const { error } = await supabase
      .from('mutes')
      .upsert({ muter_id: user.id, muted_id: userId }, { onConflict: 'muter_id,muted_id' });

    if (error) return { error: 'Failed to mute user' };
    return { success: true };
  } catch {
    return { error: 'Failed to mute user' };
  }
}

export async function unmuteUser(userId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };

    await supabase.from('mutes').delete().eq('muter_id', user.id).eq('muted_id', userId);
    return { success: true };
  } catch {
    return { error: 'Failed to unmute user' };
  }
}

export async function archivePost(postId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase.rpc('archive_post', { p_post_id: postId });
    if (error) {
      // Fallback: direct update if RPC doesn't exist
      const { error: fallbackError } = await supabase
        .from('posts')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('user_id', user.id)
        .is('archived_at', null)
        .is('deleted_at', null);
      if (fallbackError) return { error: 'Failed to archive post' };
    }
    return { success: true };
  } catch {
    return { error: 'Failed to archive post' };
  }
}

export async function unarchivePost(postId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase.rpc('unarchive_post', { p_post_id: postId });
    if (error) {
      // Fallback: direct update if RPC doesn't exist
      const { error: fallbackError } = await supabase
        .from('posts')
        .update({ archived_at: null })
        .eq('id', postId)
        .eq('user_id', user.id)
        .not('archived_at', 'is', null);
      if (fallbackError) return { error: 'Failed to unarchive post' };
    }
    return { success: true };
  } catch {
    return { error: 'Failed to unarchive post' };
  }
}

export async function toggleHideLikes(postId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data, error } = await supabase.rpc('toggle_hide_likes', { p_post_id: postId });
    if (error) return { error: 'Failed to update' };
    return { success: true, hideLikes: data as boolean };
  } catch {
    return { error: 'Failed to update' };
  }
}

export async function toggleDisableComments(postId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const { data, error } = await supabase.rpc('toggle_disable_comments', { p_post_id: postId });
    if (error) return { error: 'Failed to update' };
    return { success: true, disableComments: data as boolean };
  } catch {
    return { error: 'Failed to update' };
  }
}
