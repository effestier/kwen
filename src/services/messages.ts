import { createClient } from '@/lib/supabase/client';

export interface MediaMetadata {
  path: string;
  thumbnailPath?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
}

const SIGNED_URL_EXPIRY = 900; // 15 minutes

export async function getSignedUrl(storagePath: string): Promise<{ url?: string; error?: string }> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!storagePath || typeof storagePath !== 'string') return { error: 'Invalid path' };

    if (storagePath.startsWith('http')) return { url: storagePath };

    const { data: mediaMessages } = await supabase
      .from('messages')
      .select('conversation_id')
      .or(`media_url.eq.${storagePath},thumbnail_url.eq.${storagePath}`)
      .limit(1);

    if (!mediaMessages || mediaMessages.length === 0) return { error: 'Unauthorized' };

    const { data: accessible } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id)
      .eq('conversation_id', mediaMessages[0].conversation_id)
      .limit(1)
      .maybeSingle();

    if (!accessible) return { error: 'Unauthorized' };

    const { data, error } = await supabase.storage
      .from('messages')
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

    if (error || !data?.signedUrl) return { error: 'Failed to generate signed URL' };

    return { url: data.signedUrl };
  } catch {
    return { error: 'Failed to generate signed URL' };
  }
}

export async function sendMessage(conversationId: string, content: string, media?: MediaMetadata, replyToMessageId?: string, storyId?: string, voiceDuration?: number) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!conversationId || typeof conversationId !== 'string') return { error: 'Invalid conversation ID' };

    const cleanContent = content.trim().slice(0, 5000);

    if (!cleanContent && !media?.path && !storyId) return { error: 'Message cannot be empty' };

    // Check block status — both directions
    const { data: otherParticipant } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (otherParticipant) {
      const { data: block } = await supabase
        .from('blocks')
        .select('blocker_id')
        .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${otherParticipant.user_id}),and(blocker_id.eq.${otherParticipant.user_id},blocked_id.eq.${user.id})`)
        .limit(1)
        .maybeSingle();

      if (block) return { error: 'You cannot message this user' };
    }

    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (!participant) return { error: 'Unauthorized' };

    let messageType: string;
    if (storyId) {
      messageType = 'story_reply';
    } else if (voiceDuration != null && media?.path) {
      messageType = 'voice';
    } else if (media?.path) {
      messageType = cleanContent ? 'mixed' : 'image';
    } else {
      messageType = 'text';
    }
    const messageContent = cleanContent || (voiceDuration != null ? '' : media?.path ? 'Photo' : storyId ? '' : '');

    const insertData: Record<string, unknown> = {
      conversation_id: conversationId,
      sender_id: user.id,
      content: messageContent,
      message_type: messageType,
      media_url: media?.path || null,
      thumbnail_url: media?.thumbnailPath || null,
      mime_type: media?.mimeType || null,
      file_size: media?.fileSize || null,
      media_width: media?.width || null,
      media_height: media?.height || null,
    };

    // duration column doesn't exist yet (migration 041 not applied)
    // Voice messages work without it — the player reads duration from the audio file

    if (replyToMessageId) {
      insertData.reply_to_message_id = replyToMessageId;
    }

    if (storyId) {
      insertData.story_id = storyId;
      // Fetch and store story media_url since stories expire after 24h
      const { data: storyData } = await supabase
        .from('stories')
        .select('media_url')
        .eq('id', storyId)
        .single();
      if (storyData?.media_url) {
        insertData.media_url = storyData.media_url;
      }
    }

    let { data: message, error } = await supabase
      .from('messages')
      .insert(insertData)
      .select()
      .single();

    // Fallback: remove duration column if it doesn't exist in DB
    if (error && insertData.duration != null) {
      const { duration: _, ...fallbackData } = insertData;
      const retry = await supabase
        .from('messages')
        .insert(fallbackData)
        .select()
        .single();
      message = retry.data;
      error = retry.error;
    }

    // Fallback: voice message_type not in CHECK constraint — use 'mixed'
    if (error && insertData.message_type === 'voice') {
      insertData.message_type = 'mixed';
      const retry2 = await supabase
        .from('messages')
        .insert(insertData)
        .select()
        .single();
      message = retry2.data;
      error = retry2.error;
    }

    if (error) return { error: 'Failed to send message' };

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return { success: true, message };
  } catch {
    return { error: 'Failed to send message' };
  }
}

export async function getOrCreateConversation(otherUserId: string) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) return { error: 'Not authenticated' };
    if (!otherUserId || typeof otherUserId !== 'string') return { error: 'Invalid user ID' };
    if (user.id === otherUserId) return { error: 'Cannot message yourself' };

    // Try atomic RPC first (migration 046), fall back to client-side if not applied
    const { data: rpcResult, error: rpcError } = await supabase.rpc('get_or_create_conversation', {
      p_user1: user.id,
      p_user2: otherUserId,
    });

    if (!rpcError && rpcResult) {
      return { success: true, conversationId: rpcResult };
    }

    // RPC not available — fall back to client-side logic
    // Check if conversation already exists
    const { data: myParticipations } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (myParticipations && myParticipations.length > 0) {
      const convIds = myParticipations.map(p => p.conversation_id);
      const { data: existingConv } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', otherUserId)
        .in('conversation_id', convIds)
        .limit(1);

      if (existingConv && existingConv.length > 0) {
        return { success: true, conversationId: existingConv[0].conversation_id };
      }
    }

    // Create new conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({})
      .select()
      .single();

    if (convError || !conversation) return { error: 'Failed to create conversation' };

    // Insert own participant row (RLS allows auth.uid() = user_id)
    const { error: partError } = await supabase
      .from('conversation_participants')
      .insert({ conversation_id: conversation.id, user_id: user.id, unread_count: 0 });

    if (partError) return { error: 'Failed to create conversation' };

    // Insert other user's participant row — use RPC to bypass RLS
    // If RPC not available, the other user will be added when they first open the conversation
    await supabase.rpc('add_conversation_participant', {
      p_conversation_id: conversation.id,
      p_user_id: otherUserId,
    }).then(() => {}, () => {
      // RPC doesn't exist — other user will self-add on first message
    });

    return { success: true, conversationId: conversation.id };
  } catch {
    return { error: 'Failed to create conversation' };
  }
}

export async function getMessages(conversationId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { messages: [], error: 'Not authenticated' };
    if (!conversationId || typeof conversationId !== 'string') return { messages: [], error: 'Invalid conversation ID' };

    const { data: participant, error: partErr } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (partErr || !participant) return { messages: [], error: 'Not a participant in this conversation' };

    // Use only base columns from schema 001 to avoid 400 errors when 045 hasn't been applied
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at, deleted_at, message_type, media_url, thumbnail_url, mime_type, file_size, media_width, media_height, reply_to_message_id, story_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      console.error('[MESSAGES] getMessages query error:', error);
      return { messages: [], error: error.message };
    }
    if (!messages) return { messages: [] };

    // deleted_for column may not exist if migration 019 wasn't applied
    const visibleMessages = messages.filter(msg => {
      if (msg.deleted_at) return false;
      const deletedFor = (msg as Record<string, unknown>).deleted_for as string[] | undefined;
      if (!deletedFor || deletedFor.length === 0) return true;
      return !deletedFor.includes(user.id);
    });

    const senderIds = [...new Set(visibleMessages.map(m => m.sender_id))];
    const replyToIds = [...new Set(visibleMessages.map(m => m.reply_to_message_id).filter(Boolean))] as string[];

    const [profilesResult, reactionsResult, replyToResult] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', senderIds),
      supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', visibleMessages.map(m => m.id)).then(
        (r) => r,
        () => ({ data: [], error: null })
      ),
      replyToIds.length > 0
        ? supabase.from('messages').select('id, content, sender_id, message_type, media_url, thumbnail_url').in('id', replyToIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map(profilesResult.data?.map(p => [p.id, p]) || []);

    const reactionsMap = new Map<string, { emoji: string; userId: string }[]>();
    for (const r of reactionsResult.data || []) {
      if (!reactionsMap.has(r.message_id)) reactionsMap.set(r.message_id, []);
      reactionsMap.get(r.message_id)!.push({ emoji: r.emoji, userId: r.user_id });
    }

    const replyToMap = new Map<string, { id: string; content: string; senderId: string; messageType: string; mediaUrl: string | null; thumbnailUrl: string | null }>();
    for (const r of replyToResult.data || []) {
      replyToMap.set(r.id, {
        id: r.id,
        content: r.content,
        senderId: r.sender_id,
        messageType: r.message_type || 'text',
        mediaUrl: r.media_url || null,
        thumbnailUrl: r.thumbnail_url || null,
      });
    }

    const pathsToSign = new Set<string>();
    for (const msg of visibleMessages) {
      if (msg.media_url && !msg.media_url.startsWith('http')) pathsToSign.add(msg.media_url);
      if (msg.thumbnail_url && !msg.thumbnail_url.startsWith('http')) pathsToSign.add(msg.thumbnail_url);
    }
    for (const r of replyToResult.data || []) {
      if (r.thumbnail_url && !r.thumbnail_url.startsWith('http')) pathsToSign.add(r.thumbnail_url);
      if (r.media_url && !r.media_url.startsWith('http') && r.message_type === 'image') pathsToSign.add(r.media_url);
    }

    const signedUrlMap = new Map<string, string>();
    await Promise.all(
      [...pathsToSign].map(async (path) => {
        const { data } = await supabase.storage
          .from('messages')
          .createSignedUrl(path, SIGNED_URL_EXPIRY);
        if (data?.signedUrl) signedUrlMap.set(path, data.signedUrl);
      })
    );

    const resolveUrl = (value: string | null): string | null => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      return signedUrlMap.get(value) || null;
    };

    const formattedMessages = visibleMessages.map(msg => {
      const reactions = reactionsMap.get(msg.id) || [];
      const reactionCounts: Record<string, { count: number; userIds: string[] }> = {};
      for (const r of reactions) {
        if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, userIds: [] };
        reactionCounts[r.emoji].count++;
        reactionCounts[r.emoji].userIds.push(r.userId);
      }

      const replyToMsgId = (msg as Record<string, unknown>).reply_to_message_id as string | null;
      const replyToData = replyToMsgId ? replyToMap.get(replyToMsgId) : null;
      const replyToProfile = replyToData ? profileMap.get(replyToData.senderId) : null;

      return {
        id: msg.id,
        content: msg.content,
        senderId: msg.sender_id,
        createdAt: msg.created_at,
        isMine: msg.sender_id === user.id,
        sender: profileMap.get(msg.sender_id) || null,
        message_type: msg.message_type || 'text',
        media_path: msg.media_url || null,
        media_url: resolveUrl(msg.media_url),
        thumbnail_path: msg.thumbnail_url || null,
        thumbnail_url: resolveUrl(msg.thumbnail_url),
        mime_type: msg.mime_type || null,
        file_size: msg.file_size || null,
        media_width: msg.media_width || null,
        media_height: msg.media_height || null,
        reply_to_message_id: replyToMsgId || null,
        reply_to: replyToData ? {
          id: replyToData.id,
          content: replyToData.content,
          senderName: replyToProfile?.display_name || 'Unknown',
          messageType: replyToData.messageType,
          media_url: resolveUrl(replyToData.thumbnailUrl || replyToData.mediaUrl),
        } : null,
        reactions: reactionCounts,
        my_reaction: reactions.find(r => r.userId === user.id)?.emoji || null,
        story_id: (msg as Record<string, unknown>).story_id || null,
        duration: ((msg as Record<string, unknown>).duration as number) || null,
        forwarded_from: (msg as Record<string, unknown>).forwarded_from || null,
        delivered_at: (msg as Record<string, unknown>).delivered_at as string | null || null,
        seen_at: (msg as Record<string, unknown>).seen_at as string | null || null,
      };
    });

    return { messages: formattedMessages };
  } catch {
    return { messages: [] };
  }
}

// H16: Load older messages for pagination
export async function getOlderMessages(conversationId: string, beforeCreatedAt: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { messages: [] };
    if (!conversationId || typeof conversationId !== 'string') return { messages: [] };

    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (!participant) return { messages: [] };

    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at, deleted_at, message_type, media_url, thumbnail_url, mime_type, file_size, media_width, media_height, reply_to_message_id, story_id')
      .eq('conversation_id', conversationId)
      .lt('created_at', beforeCreatedAt)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error || !messages) return { messages: [] };

    const visibleMessages = messages.filter(msg => {
      if (msg.deleted_at) return false;
      const deletedFor = (msg as Record<string, unknown>).deleted_for as string[] | undefined;
      if (!deletedFor || deletedFor.length === 0) return true;
      return !deletedFor.includes(user.id);
    });

    const senderIds = [...new Set(visibleMessages.map(m => m.sender_id))];
    const replyToIds = [...new Set(visibleMessages.map(m => m.reply_to_message_id).filter(Boolean))] as string[];

    const [profilesResult, reactionsResult, replyToResult] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', senderIds),
      supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', visibleMessages.map(m => m.id)).then(
        (r) => r,
        () => ({ data: [], error: null })
      ),
      replyToIds.length > 0
        ? supabase.from('messages').select('id, content, sender_id, message_type, media_url, thumbnail_url').in('id', replyToIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map(profilesResult.data?.map(p => [p.id, p]) || []);

    const reactionsMap = new Map<string, { emoji: string; userId: string }[]>();
    for (const r of reactionsResult.data || []) {
      if (!reactionsMap.has(r.message_id)) reactionsMap.set(r.message_id, []);
      reactionsMap.get(r.message_id)!.push({ emoji: r.emoji, userId: r.user_id });
    }

    const replyToMap = new Map<string, { id: string; content: string; senderId: string; messageType: string; mediaUrl: string | null; thumbnailUrl: string | null }>();
    for (const r of replyToResult.data || []) {
      replyToMap.set(r.id, {
        id: r.id,
        content: r.content,
        senderId: r.sender_id,
        messageType: r.message_type || 'text',
        mediaUrl: r.media_url || null,
        thumbnailUrl: r.thumbnail_url || null,
      });
    }

    const pathsToSign = new Set<string>();
    for (const msg of visibleMessages) {
      if (msg.media_url && !msg.media_url.startsWith('http')) pathsToSign.add(msg.media_url);
      if (msg.thumbnail_url && !msg.thumbnail_url.startsWith('http')) pathsToSign.add(msg.thumbnail_url);
    }
    for (const r of replyToResult.data || []) {
      if (r.thumbnail_url && !r.thumbnail_url.startsWith('http')) pathsToSign.add(r.thumbnail_url);
      if (r.media_url && !r.media_url.startsWith('http') && r.message_type === 'image') pathsToSign.add(r.media_url);
    }

    const signedUrlMap = new Map<string, string>();
    await Promise.all(
      [...pathsToSign].map(async (path) => {
        const { data } = await supabase.storage
          .from('messages')
          .createSignedUrl(path, SIGNED_URL_EXPIRY);
        if (data?.signedUrl) signedUrlMap.set(path, data.signedUrl);
      })
    );

    const resolveUrl = (value: string | null): string | null => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      return signedUrlMap.get(value) || null;
    };

    const formattedMessages = visibleMessages.map(msg => {
      const reactions = reactionsMap.get(msg.id) || [];
      const reactionCounts: Record<string, { count: number; userIds: string[] }> = {};
      for (const r of reactions) {
        if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, userIds: [] };
        reactionCounts[r.emoji].count++;
        reactionCounts[r.emoji].userIds.push(r.userId);
      }

      const replyToMsgId = (msg as Record<string, unknown>).reply_to_message_id as string | null;
      const replyToData = replyToMsgId ? replyToMap.get(replyToMsgId) : null;
      const replyToProfile = replyToData ? profileMap.get(replyToData.senderId) : null;

      return {
        id: msg.id,
        content: msg.content,
        senderId: msg.sender_id,
        createdAt: msg.created_at,
        isMine: msg.sender_id === user.id,
        sender: profileMap.get(msg.sender_id) || null,
        message_type: msg.message_type || 'text',
        media_path: msg.media_url || null,
        media_url: resolveUrl(msg.media_url),
        thumbnail_path: msg.thumbnail_url || null,
        thumbnail_url: resolveUrl(msg.thumbnail_url),
        mime_type: msg.mime_type || null,
        file_size: msg.file_size || null,
        media_width: msg.media_width || null,
        media_height: msg.media_height || null,
        reply_to_message_id: replyToMsgId || null,
        reply_to: replyToData ? {
          id: replyToData.id,
          content: replyToData.content,
          senderName: replyToProfile?.display_name || 'Unknown',
          messageType: replyToData.messageType,
          media_url: resolveUrl(replyToData.thumbnailUrl || replyToData.mediaUrl),
        } : null,
        reactions: reactionCounts,
        my_reaction: reactions.find(r => r.userId === user.id)?.emoji || null,
        story_id: (msg as Record<string, unknown>).story_id || null,
        duration: ((msg as Record<string, unknown>).duration as number) || null,
        forwarded_from: (msg as Record<string, unknown>).forwarded_from || null,
        delivered_at: (msg as Record<string, unknown>).delivered_at as string | null || null,
        seen_at: (msg as Record<string, unknown>).seen_at as string | null || null,
      };
    });

    return { messages: formattedMessages };
  } catch {
    return { messages: [] };
  }
}

export async function markConversationAsRead(conversationId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !conversationId) return;

    await supabase
      .from('conversation_participants')
      .update({ unread_count: 0, last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
  } catch {
    // Silent fail
  }
}

export async function markMessagesAsDelivered(conversationId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !conversationId) return;

    // 045: Use RPC if available; silently no-op if migration not applied
    await supabase.rpc('mark_messages_delivered', { p_conversation_id: conversationId });
  } catch {
    // Silent fail — migration 045 may not be applied
  }
}

export async function markMessagesAsSeen(conversationId: string): Promise<string[]> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !conversationId) return [];

    // Use SECURITY DEFINER RPC — direct UPDATE blocked by sender-only RLS policy
    const { error } = await supabase.rpc('mark_messages_seen', {
      p_conversation_id: conversationId,
    });

    if (error) {
      console.warn('[MESSAGES] markMessagesAsSeen RPC failed:', error.message);
      return [];
    }
    return [];
  } catch {
    return [];
  }
}

export async function getUnreadMessageCount() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return 0;

    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('unread_count')
      .eq('user_id', user.id);

    return participants?.reduce((sum, p) => sum + (p.unread_count || 0), 0) || 0;
  } catch {
    return 0;
  }
}

export async function addReaction(messageId: string, emoji: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!messageId || !emoji) return { error: 'Invalid input' };

    const { data: message } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', messageId)
      .single();

    if (!message) return { error: 'Message not found' };

    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', message.conversation_id)
      .eq('user_id', user.id)
      .single();

    if (!participant) return { error: 'Unauthorized' };

    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id, emoji')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      if (existing.emoji === emoji) {
        await supabase.from('message_reactions').delete().eq('id', existing.id);
        return { success: true, action: 'removed', emoji };
      } else {
        await supabase.from('message_reactions').update({ emoji }).eq('id', existing.id);
        return { success: true, action: 'swapped', emoji };
      }
    }

    const { error } = await supabase
      .from('message_reactions')
      .insert({ message_id: messageId, user_id: user.id, emoji });

    if (error) return { error: 'Failed to add reaction' };
    return { success: true, action: 'added', emoji };
  } catch {
    return { error: 'Failed to add reaction' };
  }
}

export async function removeReaction(messageId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };

    await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id);

    return { success: true };
  } catch {
    return { error: 'Failed to remove reaction' };
  }
}

export async function getMessageReactions(messageId: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { reactions: {} };

    const { data } = await supabase
      .from('message_reactions')
      .select('emoji, user_id')
      .eq('message_id', messageId);

    if (!data) return { reactions: {} };

    const reactionCounts: Record<string, { count: number; userIds: string[] }> = {};
    for (const r of data) {
      if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, userIds: [] };
      reactionCounts[r.emoji].count++;
      reactionCounts[r.emoji].userIds.push(r.user_id);
    }

    return { reactions: reactionCounts };
  } catch {
    return { reactions: {} };
  }
}

export async function deleteMessage(messageId: string, deleteForEveryone: boolean) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'Not authenticated' };
    if (!messageId) return { error: 'Invalid message ID' };

    const { data: message } = await supabase
      .from('messages')
      .select('id, sender_id, created_at, media_url, thumbnail_url')
      .eq('id', messageId)
      .single();

    if (!message) return { error: 'Message not found' };

    if (deleteForEveryone) {
      if (message.sender_id !== user.id) return { error: 'You can only delete your own messages' };

      const messageAge = Date.now() - new Date(message.created_at).getTime();
      const tenMinutes = 10 * 60 * 1000;

      if (messageAge > tenMinutes) return { error: 'Can only delete for everyone within 10 minutes' };

      const { error } = await supabase
        .from('messages')
        .update({
          content: 'This message was deleted',
          media_url: null,
          thumbnail_url: null,
          mime_type: null,
          file_size: null,
          media_width: null,
          media_height: null,
          message_type: 'text',
        })
        .eq('id', messageId);

      if (error) return { error: 'Failed to delete message' };
      return { success: true, action: 'deleted_for_everyone' };
    } else {
      // Use SECURITY DEFINER RPC — direct UPDATE blocked by sender-only RLS policy
      const { error } = await supabase.rpc('delete_message_for_me', {
        p_message_id: messageId,
      });

      if (error) {
        console.warn('[MESSAGES] deleteMessage for_me RPC failed:', error.message);
        return { error: 'Failed to delete message' };
      }
      return { success: true, action: 'deleted_for_me' };
    }
  } catch {
    return { error: 'Failed to delete message' };
  }
}

export async function reportMessage(messageId: string, reason: string) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    if (!messageId) return { error: 'Invalid message' };
    if (!reason || reason.length < 3) return { error: 'Reason must be at least 3 characters' };

    // Get the message sender to record who was reported
    const { data: message } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .single();

    if (!message) return { error: 'Message not found' };

    const { error } = await supabase
      .from('reports')
      .insert({
        reporter_id: user.id,
        reported_user_id: message.sender_id,
        message_id: messageId,
        reason: reason.slice(0, 200),
      });

    if (error) {
      // Unique constraint violation = already reported
      if (error.code === '23505') return { error: 'You have already reported this message' };
      return { error: 'Failed to submit report' };
    }

    return { success: true };
  } catch {
    return { error: 'Failed to submit report' };
  }
}
