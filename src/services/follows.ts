import { createClient } from '@/lib/supabase/client';

export async function toggleFollow(userId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!userId || typeof userId !== 'string') return { error: 'Invalid user ID' };
    if (user.id === userId) return { error: 'Cannot follow yourself' };

    const { data: targetUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (!targetUser) return { error: 'User not found' };

    const { data: existing } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', userId)
      .single();

    if (existing) {
      await supabase.from('follows').delete().eq('id', existing.id);
    } else {
      const { error: followError } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: userId });

      // Handle race condition: if another request already inserted, treat as success
      if (followError) {
        if (followError.code === '23505') {
          // Unique constraint violation — already following, treat as success
          return { success: true };
        }
        return { error: 'Failed to follow user' };
      }

      await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'follow',
          actor_id: user.id,
          is_read: false,
        });
    }

    return { success: true };
  } catch {
    return { error: 'Failed to process follow' };
  }
}

export async function getFollowers(userId: string, limit = 20, cursor?: string) {
  try {
    const supabase = createClient();

    if (!userId || typeof userId !== 'string') return { followers: [], nextCursor: undefined };

    const safeLimit = Math.min(Math.max(1, limit), 50);

    let query = supabase
      .from('follows')
      .select('follower_id, created_at')
      .eq('following_id', userId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: follows, error } = await query;

    if (error || !follows) return { followers: [], nextCursor: undefined };

    const followerIds = follows.map(f => f.follower_id);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, is_verified')
      .in('id', followerIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    const followers = follows.map(f => profileMap.get(f.follower_id)).filter(Boolean);

    const nextCursor = follows.length === safeLimit ? follows[safeLimit - 1].created_at : undefined;

    return { followers, nextCursor };
  } catch {
    return { followers: [], nextCursor: undefined };
  }
}

export async function getFollowing(userId: string, limit = 20, cursor?: string) {
  try {
    const supabase = createClient();

    if (!userId || typeof userId !== 'string') return { following: [], nextCursor: undefined };

    const safeLimit = Math.min(Math.max(1, limit), 50);

    let query = supabase
      .from('follows')
      .select('following_id, created_at')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: follows, error } = await query;

    if (error || !follows) return { following: [], nextCursor: undefined };

    const followingIds = follows.map(f => f.following_id);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, is_verified')
      .in('id', followingIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    const following = follows.map(f => profileMap.get(f.following_id)).filter(Boolean);

    const nextCursor = follows.length === safeLimit ? follows[safeLimit - 1].created_at : undefined;

    return { following, nextCursor };
  } catch {
    return { following: [], nextCursor: undefined };
  }
}
