import { createClient } from '@/lib/supabase/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addStoryReaction(storyId: string, emoji: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated' };
  if (!UUID_RE.test(storyId)) return { error: 'Invalid story ID' };
  if (!emoji || emoji.length > 10) return { error: 'Invalid emoji' };

  const { error } = await supabase
    .from('story_reactions')
    .upsert({
      story_id: storyId,
      user_id: user.id,
      emoji,
    }, {
      onConflict: 'story_id,user_id,emoji'
    });

  if (error) return { error: 'Failed to add reaction' };
  return { success: true };
}

export async function removeStoryReaction(storyId: string, emoji: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated' };
  if (!UUID_RE.test(storyId)) return { error: 'Invalid story ID' };

  await supabase
    .from('story_reactions')
    .delete()
    .eq('story_id', storyId)
    .eq('user_id', user.id)
    .eq('emoji', emoji);

  return { success: true };
}

export async function getStoryReactions(storyId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];
  if (!UUID_RE.test(storyId)) return [];

  const { data, error } = await supabase
    .from('story_reactions')
    .select('emoji, created_at, user_id')
    .eq('story_id', storyId)
    .order('created_at', { ascending: false });

  if (error) return [];

  const reactionMap = new Map<string, { count: number; users: string[] }>();

  for (const r of data) {
    if (!reactionMap.has(r.emoji)) {
      reactionMap.set(r.emoji, { count: 0, users: [] });
    }
    const entry = reactionMap.get(r.emoji)!;
    entry.count++;
    if (r.user_id) entry.users.push(r.user_id);
  }

  return Array.from(reactionMap.entries()).map(([emoji, { count, users }]) => ({
    emoji,
    count,
    users
  }));
}

export async function sendStoryReply(storyId: string, message: string, recipientId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated' };
  if (!UUID_RE.test(storyId)) return { error: 'Invalid story ID' };
  if (!UUID_RE.test(recipientId)) return { error: 'Invalid recipient' };

  const cleanMessage = message.trim().slice(0, 1000);
  if (!cleanMessage) return { error: 'Message cannot be empty' };

  // Get story media_url for the message preview
  const { data: story } = await supabase
    .from('stories')
    .select('media_url')
    .eq('id', storyId)
    .single();

  // Get or create DM conversation with story owner
  const { getOrCreateConversation, sendMessage } = await import('./messages');
  const convResult = await getOrCreateConversation(recipientId);
  if (convResult.error || !convResult.conversationId) {
    return { error: convResult.error || 'Failed to create conversation' };
  }

  // Send as story_reply message type, including story media_url for preview
  const result = await sendMessage(convResult.conversationId, cleanMessage, story?.media_url ? { path: story.media_url } : undefined, undefined, storyId);

  return result;
}

export async function getStoryReplies(storyId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];
  if (!UUID_RE.test(storyId)) return [];

  const { data: story } = await supabase
    .from('stories')
    .select('user_id')
    .eq('id', storyId)
    .single();

  if (!story) return [];

  const { data: replies, error } = await supabase
    .from('story_replies')
    .select('id, message, created_at, sender_id, recipient_id')
    .eq('story_id', storyId)
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error || !replies) return [];

  const senderIds = [...new Set(replies.map(r => r.sender_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', senderIds);

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

  return replies.map(r => ({
    id: r.id,
    message: r.message,
    created_at: r.created_at,
    sender: profileMap.get(r.sender_id) || null,
  }));
}

export async function getStoryRepliesForUser(userId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];
  if (user.id !== userId) return [];

  const { data: replies, error } = await supabase
    .from('story_replies')
    .select('id, story_id, message, created_at, sender_id, recipient_id')
    .eq('recipient_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false });

  if (error || !replies) return [];

  const senderIds = [...new Set(replies.map(r => r.sender_id))];
  const storyIds = [...new Set(replies.map(r => r.story_id))];

  const [sendersResult, storiesResult] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', senderIds),
    supabase.from('stories').select('id, user_id').in('id', storyIds)
  ]);

  const profileMap = new Map(sendersResult.data?.map(p => [p.id, p]) || []);
  const storyMap = new Map(storiesResult.data?.map(s => [s.id, s]) || []);

  return replies.map(r => ({
    id: r.id,
    storyId: r.story_id,
    storyOwnerId: storyMap.get(r.story_id)?.user_id,
    message: r.message,
    createdAt: r.created_at,
    sender: profileMap.get(r.sender_id) || null,
  }));
}

export async function markStoryReplyAsRead(replyId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated' };
  if (!UUID_RE.test(replyId)) return { error: 'Invalid reply ID' };

  await supabase
    .from('story_replies')
    .update({ is_read: true })
    .eq('id', replyId)
    .eq('recipient_id', user.id);

  return { success: true };
}

export async function getStoryViewers(storyId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];
  if (!UUID_RE.test(storyId)) return [];

  const { data: story } = await supabase
    .from('stories')
    .select('user_id')
    .eq('id', storyId)
    .single();

  if (!story || story.user_id !== user.id) return [];

  const { data, error } = await supabase
    .from('story_views')
    .select('user_id, created_at')
    .eq('story_id', storyId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  const userIds = data.map(v => v.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds);

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

  return data.map(v => ({
    user: profileMap.get(v.user_id) || null,
    viewedAt: v.created_at,
  }));
}

export async function getUserStoryViews(userId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];
  if (user.id !== userId) return [];

  const { data: stories } = await supabase
    .from('stories')
    .select('id')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString());

  if (!stories || stories.length === 0) return [];

  const storyIds = stories.map(s => s.id);

  const { data: views } = await supabase
    .from('story_views')
    .select('story_id, user_id, created_at')
    .in('story_id', storyIds)
    .order('created_at', { ascending: false });

  if (!views) return [];

  const viewerIds = [...new Set(views.map(v => v.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', viewerIds);

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

  const viewerMap = new Map<string, { user: any; stories: string[]; lastViewed: string }>();

  for (const v of views) {
    const profile = profileMap.get(v.user_id);
    if (!profile) continue;

    if (!viewerMap.has(v.user_id)) {
      viewerMap.set(v.user_id, {
        user: profile,
        stories: [],
        lastViewed: v.created_at,
      });
    }
    const entry = viewerMap.get(v.user_id)!;
    entry.stories.push(v.story_id);
    if (v.created_at > entry.lastViewed) {
      entry.lastViewed = v.created_at;
    }
  }

  return Array.from(viewerMap.values());
}

export async function addStoryMusic(storyId: string, trackName: string, artist: string, previewUrl: string, coverUrl: string, startTime = 0, duration = 15) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated' };
  if (!UUID_RE.test(storyId)) return { error: 'Invalid story ID' };
  if (!trackName || trackName.length > 200) return { error: 'Invalid track name' };
  if (!artist || artist.length > 200) return { error: 'Invalid artist' };
  if (!previewUrl || previewUrl.length > 500) return { error: 'Invalid preview URL' };
  if (!coverUrl || coverUrl.length > 500) return { error: 'Invalid cover URL' };
  // Validate URLs are safe (https only)
  try {
    const pUrl = new URL(previewUrl);
    const cUrl = new URL(coverUrl);
    if (pUrl.protocol !== 'https:' || cUrl.protocol !== 'https:') {
      return { error: 'URLs must use HTTPS' };
    }
  } catch {
    return { error: 'Invalid URL format' };
  }

  const { data: story } = await supabase
    .from('stories')
    .select('user_id')
    .eq('id', storyId)
    .single();

  if (!story || story.user_id !== user.id) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('story_music')
    .insert({
      story_id: storyId,
      track_name: trackName,
      artist,
      preview_url: previewUrl,
      cover_url: coverUrl,
      start_time: startTime,
      duration,
    });

  if (error) return { error: 'Failed to add music' };
  return { success: true };
}

export async function getStoryMusic(storyId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;
  if (!UUID_RE.test(storyId)) return null;

  const { data, error } = await supabase
    .from('story_music')
    .select('*')
    .eq('story_id', storyId)
    .single();

  if (error || !data) return null;
  return data;
}


