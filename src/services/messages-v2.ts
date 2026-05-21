// Production messaging service v2
// Fixes: N+1 queries, typing debounce, read receipts, presence, conversation ordering

import { createClient } from '@/lib/supabase/client';

const SIGNED_URL_EXPIRY = 900; // 15 minutes
const TYPING_DEBOUNCE_MS = 400;
const TYPING_TIMEOUT_MS = 2000;

export interface Conversation {
  id: string;
  otherUser: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isOnline: boolean;
    lastSeenAt: string | null;
  };
  lastMessage: {
    content: string;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  deliveredAt: string | null;
  seenAt: string | null;
  replyToMessageId: string | null;
  sender: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  reactions?: Reaction[];
  replyTo?: {
    content: string;
    senderUsername: string;
  };
  media?: {
    url: string;
    type: string;
    thumbnailUrl?: string;
  }[];
}

export interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface TypingState {
  userId: string;
  displayName: string;
  typingAt: number;
}

// =============================================
// CONVERSATIONS
// =============================================

export async function getConversations(userId: string): Promise<Conversation[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('get_conversations', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[messages] getConversations error:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.conversation_id,
    otherUser: {
      id: row.other_user_id,
      username: row.other_username,
      displayName: row.other_display_name,
      avatarUrl: row.other_avatar_url,
      isOnline: row.other_is_online,
      lastSeenAt: row.other_last_seen_at,
    },
    lastMessage: row.last_message_content ? {
      content: row.last_message_content,
      senderId: row.last_message_sender_id,
      createdAt: row.last_message_created_at,
    } : null,
    unreadCount: row.unread_count || 0,
    updatedAt: row.updated_at,
  }));
}

export async function getOrCreateConversation(
  currentUserId: string,
  otherUserId: string
): Promise<string | null> {
  const supabase = createClient();

  // Check if conversation already exists
  const { data: otherConversations } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', otherUserId);

  const otherConvIds = otherConversations?.map(p => p.conversation_id) || [];

  if (otherConvIds.length > 0) {
    const { data: existing } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', currentUserId)
      .in('conversation_id', otherConvIds)
      .limit(1)
      .single();

    if (existing) {
      return existing.conversation_id;
    }
  }

  // Create new conversation
  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({})
    .select('id')
    .single();

  if (error || !conversation) {
    console.error('[messages] create conversation error:', error);
    return null;
  }

  // Add both participants
  const { error: participantError } = await supabase
    .from('conversation_participants')
    .insert([
      { conversation_id: conversation.id, user_id: currentUserId },
      { conversation_id: conversation.id, user_id: otherUserId },
    ]);

  if (participantError) {
    console.error('[messages] add participants error:', participantError);
    return null;
  }

  return conversation.id;
}

// =============================================
// MESSAGES
// =============================================

export async function getMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
  limit: number = 50
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('get_messages_with_receipts', {
    p_conversation_id: conversationId,
    p_user_id: userId,
    p_limit: limit + 1,
    p_cursor: cursor || null,
  });

  if (error) {
    console.error('[messages] getMessages error:', error);
    return { messages: [], hasMore: false };
  }

  const rows = data || [];
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).map(mapRowToMessage);

  // Fetch reactions for these messages
  if (messages.length > 0) {
    const messageIds = messages.map((m: Message) => m.id);
    const { data: reactions } = await supabase
      .from('message_reactions')
      .select('message_id, emoji, user_id')
      .in('message_id', messageIds);

    if (reactions) {
      const reactionMap = new Map<string, Reaction[]>();
      for (const r of reactions) {
        const existing = reactionMap.get(r.message_id) || [];
        const found = existing.find(e => e.emoji === r.emoji);
        if (found) {
          found.count++;
          found.userIds.push(r.user_id);
        } else {
          existing.push({ emoji: r.emoji, count: 1, userIds: [r.user_id] });
        }
        reactionMap.set(r.message_id, existing);
      }
      for (const msg of messages) {
        msg.reactions = reactionMap.get(msg.id) || [];
      }
    }

    // Fetch reply-to messages
    const replyToIds = messages.filter((m: Message) => m.replyToMessageId).map((m: Message) => m.replyToMessageId!);
    if (replyToIds.length > 0) {
      const { data: replyToMessages } = await supabase
        .from('messages')
        .select('id, content, sender_id, profiles!inner(username)')
        .in('id', replyToIds);

      if (replyToMessages) {
        const replyMap = new Map(replyToMessages.map((r: any) => [r.id, {
          content: r.content,
          senderUsername: r.profiles?.username || 'user',
        }]));
        for (const msg of messages) {
          if (msg.replyToMessageId) {
            msg.replyTo = replyMap.get(msg.replyToMessageId);
          }
        }
      }
    }
  }

  // Fetch signed URLs for media messages
  for (const msg of messages) {
    if (msg.media && msg.media.length > 0) {
      for (const m of msg.media) {
        if (m.url && !m.url.startsWith('http')) {
          const { data: signed } = await supabase.storage
            .from('messages')
            .createSignedUrl(m.url, SIGNED_URL_EXPIRY);
          if (signed) {
            m.url = signed.signedUrl;
          }
        }
      }
    }
  }

  return { messages, hasMore };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  replyToMessageId?: string,
  media?: { url: string; type: string; storagePath?: string }[]
): Promise<Message | null> {
  const supabase = createClient();

  const insertData: any = {
    conversation_id: conversationId,
    sender_id: senderId,
    content: content || '',
  };

  if (replyToMessageId) {
    insertData.reply_to_message_id = replyToMessageId;
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert(insertData)
    .select('*')
    .single();

  if (error || !message) {
    console.error('[messages] sendMessage error:', error);
    return null;
  }

  // Insert media if present
  if (media && media.length > 0) {
    const mediaInserts = media.map((m, idx) => ({
      message_id: message.id,
      storage_path: m.storagePath || m.url,
      media_type: m.type,
      sort_order: idx,
    }));

    const { error: mediaError } = await supabase
      .from('message_media')
      .insert(mediaInserts);

    if (mediaError) {
      console.error('[messages] insert media error:', mediaError);
    }
  }

  return mapRowToMessage(message);
}

// =============================================
// READ RECEIPTS
// =============================================

export async function markConversationAsRead(
  conversationId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });

  if (error) {
    console.error('[messages] markConversationAsRead error:', error);
  }
}

// =============================================
// PRESENCE
// =============================================

export async function updatePresence(
  userId: string,
  isOnline: boolean
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.rpc('update_user_presence', {
    p_user_id: userId,
    p_is_online: isOnline,
  });

  if (error) {
    console.error('[messages] updatePresence error:', error);
  }
}

// =============================================
// TYPING INDICATOR
// =============================================

export class TypingManager {
  private channel: any = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private isTyping = false;
  private conversationId: string;
  private userId: string;
  private displayName: string;
  private onTypingChange: (users: TypingState[]) => void;

  constructor(
    conversationId: string,
    userId: string,
    displayName: string,
    onTypingChange: (users: TypingState[]) => void
  ) {
    this.conversationId = conversationId;
    this.userId = userId;
    this.displayName = displayName;
    this.onTypingChange = onTypingChange;
  }

  subscribe() {
    const supabase = createClient();
    this.channel = supabase.channel(`typing-${this.conversationId}`);

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        const typingUsers: TypingState[] = [];
        for (const [key, value] of Object.entries(state)) {
          const presences = value as any[];
          for (const p of presences) {
            if (p.user_id !== this.userId) {
              typingUsers.push({
                userId: p.user_id,
                displayName: p.display_name,
                typingAt: p.typing_at,
              });
            }
          }
        }
        this.onTypingChange(typingUsers);
      })
      .subscribe();
  }

  handleInput() {
    // Debounce: only send typing event every TYPING_DEBOUNCE_MS
    if (this.debounceTimer) return;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
    }, TYPING_DEBOUNCE_MS);

    if (!this.isTyping) {
      this.isTyping = true;
      this.sendTypingEvent();
    }

    // Reset timeout
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = setTimeout(() => {
      this.stopTyping();
    }, TYPING_TIMEOUT_MS);
  }

  stopTyping() {
    if (!this.isTyping) return;
    this.isTyping = false;
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    // Untrack presence
    if (this.channel) {
      this.channel.untrack();
    }
  }

  private sendTypingEvent() {
    if (!this.channel) return;
    this.channel.track({
      user_id: this.userId,
      display_name: this.displayName,
      typing_at: Date.now(),
    });
  }

  unsubscribe() {
    this.stopTyping();
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }
}

// =============================================
// REACTIONS
// =============================================

export async function addReaction(
  messageId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const supabase = createClient();

  // Check if user already has a reaction on this message
  const { data: existing } = await supabase
    .from('message_reactions')
    .select('id, emoji')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    if (existing.emoji === emoji) {
      // Same emoji = remove (toggle off)
      await supabase.from('message_reactions').delete().eq('id', existing.id);
    } else {
      // Different emoji = swap
      await supabase.from('message_reactions').update({ emoji }).eq('id', existing.id);
    }
  } else {
    // New reaction
    await supabase.from('message_reactions').insert({
      message_id: messageId,
      user_id: userId,
      emoji,
    });
  }
}

export async function removeReaction(
  messageId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId);
}

// =============================================
// DELETE
// =============================================

export async function deleteMessage(
  messageId: string,
  userId: string,
  forEveryone: boolean
): Promise<void> {
  const supabase = createClient();

  if (forEveryone) {
    // Soft delete - mark as deleted
    await supabase
      .from('messages')
      .update({ content: 'This message was deleted', deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_id', userId);
  } else {
    // Delete for me - add to deleted_for array
    const { data: msg } = await supabase
      .from('messages')
      .select('deleted_for')
      .eq('id', messageId)
      .single();

    if (msg) {
      const deletedFor = msg.deleted_for || [];
      if (!deletedFor.includes(userId)) {
        deletedFor.push(userId);
        await supabase
          .from('messages')
          .update({ deleted_for: deletedFor })
          .eq('id', messageId);
      }
    }
  }
}

// =============================================
// HELPERS
// =============================================

function mapRowToMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at || null,
    seenAt: row.seen_at || null,
    replyToMessageId: row.reply_to_message_id || null,
    sender: {
      username: row.sender_username || '',
      displayName: row.sender_display_name || '',
      avatarUrl: row.sender_avatar_url || null,
    },
    reactions: [],
    media: row.media || [],
  };
}

export function getUnreadCount(conversations: Conversation[]): number {
  return conversations.reduce((sum, c) => sum + c.unreadCount, 0);
}
