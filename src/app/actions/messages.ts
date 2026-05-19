'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface MediaMetadata {
  path: string;
  thumbnailPath?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

const SIGNED_URL_EXPIRY = 900; // 15 minutes

/**
 * Generate a signed URL for a message media storage path.
 * Verifies user is authenticated AND is a participant in a conversation
 * that contains a message referencing this storage path.
 */
export async function getSignedUrl(storagePath: string): Promise<{ url?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    if (!storagePath || typeof storagePath !== 'string') {
      return { error: 'Invalid path' }
    }

    // If it's already a full URL (legacy), return as-is
    if (storagePath.startsWith('http')) {
      return { url: storagePath }
    }

    // Verify user is a participant in a conversation containing this media
    const { data: mediaMessages } = await supabase
      .from('messages')
      .select('conversation_id')
      .or(`media_url.eq.${storagePath},thumbnail_url.eq.${storagePath}`)
      .limit(1)

    if (!mediaMessages || mediaMessages.length === 0) {
      return { error: 'Unauthorized' }
    }

    const { data: accessible } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id)
      .eq('conversation_id', mediaMessages[0].conversation_id)
      .limit(1)
      .maybeSingle()

    if (!accessible) {
      return { error: 'Unauthorized' }
    }

    const { data, error } = await supabase.storage
      .from('messages')
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)

    if (error || !data?.signedUrl) {
      return { error: 'Failed to generate signed URL' }
    }

    return { url: data.signedUrl }
  } catch {
    return { error: 'Failed to generate signed URL' }
  }
}

export async function sendMessage(conversationId: string, content: string, media?: MediaMetadata, replyToMessageId?: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    if (!conversationId || typeof conversationId !== 'string') {
      return { error: 'Invalid conversation ID' }
    }

    const cleanContent = content.trim().slice(0, 5000)

    if (!cleanContent && !media?.path) {
      return { error: 'Message cannot be empty' }
    }

    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (!participant) {
      return { error: 'Unauthorized' }
    }

    const messageType = media?.path ? (cleanContent ? 'mixed' : 'image') : 'text'
    const messageContent = cleanContent || (media?.path ? 'Photo' : '')

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
    }

    if (replyToMessageId) {
      insertData.reply_to_message_id = replyToMessageId
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      return { error: 'Failed to send message' }
    }

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    revalidatePath('/messages')
    return { success: true, message }
  } catch {
    return { error: 'Failed to send message' }
  }
}

export async function getOrCreateConversation(otherUserId: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { error: 'Not authenticated' }
    }

    if (!otherUserId || typeof otherUserId !== 'string') {
      return { error: 'Invalid user ID' }
    }

    if (user.id === otherUserId) {
      return { error: 'Cannot message yourself' }
    }

    // Verify target user exists
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', otherUserId)
      .single()

    if (!targetUser) {
      return { error: 'User not found' }
    }

    // Check for existing conversation
    const { data: myParticipations } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id)

    if (myParticipations && myParticipations.length > 0) {
      const convIds = myParticipations.map(p => p.conversation_id)

      const { data: existingConv } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', otherUserId)
        .in('conversation_id', convIds)
        .limit(1)

      if (existingConv && existingConv.length > 0) {
        return { success: true, conversationId: existingConv[0].conversation_id }
      }
    }

    // Create new conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({})
      .select()
      .single()

    if (convError || !conversation) {
      return { error: 'Failed to create conversation' }
    }

    const { error: partError } = await supabase
      .from('conversation_participants')
      .insert([
        { conversation_id: conversation.id, user_id: user.id, unread_count: 0 },
        { conversation_id: conversation.id, user_id: otherUserId, unread_count: 0 },
      ])

    if (partError) {
      return { error: 'Failed to create conversation' }
    }

    return { success: true, conversationId: conversation.id }
  } catch {
    return { error: 'Failed to create conversation' }
  }
}

export async function getMessages(conversationId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { messages: [] }
    }

    if (!conversationId || typeof conversationId !== 'string') {
      return { messages: [] }
    }

    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (!participant) {
      return { messages: [] }
    }

    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at, message_type, media_url, thumbnail_url, mime_type, file_size, media_width, media_height, reply_to_message_id, deleted_for')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error || !messages) {
      return { messages: [] }
    }

    // Filter out messages deleted for this user
    const visibleMessages = messages.filter(msg => {
      if (!msg.deleted_for || msg.deleted_for.length === 0) return true
      return !msg.deleted_for.includes(user.id)
    })

    const senderIds = [...new Set(visibleMessages.map(m => m.sender_id))]

    // Collect reply-to message IDs for preview data
    const replyToIds = [...new Set(visibleMessages.map(m => m.reply_to_message_id).filter(Boolean))] as string[]

    const [profilesResult, reactionsResult, replyToResult] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', senderIds),
      supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', visibleMessages.map(m => m.id)),
      replyToIds.length > 0
        ? supabase.from('messages').select('id, content, sender_id, message_type, media_url, thumbnail_url').in('id', replyToIds)
        : Promise.resolve({ data: [] }),
    ])

    const profileMap = new Map(profilesResult.data?.map(p => [p.id, p]) || [])

    // Group reactions by message_id
    const reactionsMap = new Map<string, { emoji: string; userId: string }[]>()
    for (const r of reactionsResult.data || []) {
      if (!reactionsMap.has(r.message_id)) reactionsMap.set(r.message_id, [])
      reactionsMap.get(r.message_id)!.push({ emoji: r.emoji, userId: r.user_id })
    }

    // Reply-to preview map
    const replyToMap = new Map<string, { id: string; content: string; senderId: string; messageType: string; mediaUrl: string | null; thumbnailUrl: string | null }>()
    for (const r of replyToResult.data || []) {
      replyToMap.set(r.id, {
        id: r.id,
        content: r.content,
        senderId: r.sender_id,
        messageType: r.message_type || 'text',
        mediaUrl: r.media_url || null,
        thumbnailUrl: r.thumbnail_url || null,
      })
    }

    // Collect unique storage paths that need signed URLs
    const pathsToSign = new Set<string>()
    for (const msg of visibleMessages) {
      if (msg.media_url && !msg.media_url.startsWith('http')) pathsToSign.add(msg.media_url)
      if (msg.thumbnail_url && !msg.thumbnail_url.startsWith('http')) pathsToSign.add(msg.thumbnail_url)
    }
    // Also sign reply-to thumbnails
    for (const r of replyToResult.data || []) {
      if (r.thumbnail_url && !r.thumbnail_url.startsWith('http')) pathsToSign.add(r.thumbnail_url)
      if (r.media_url && !r.media_url.startsWith('http') && r.message_type === 'image') pathsToSign.add(r.media_url)
    }

    const signedUrlMap = new Map<string, string>()
    await Promise.all(
      [...pathsToSign].map(async (path) => {
        const { data } = await supabase.storage
          .from('messages')
          .createSignedUrl(path, SIGNED_URL_EXPIRY)
        if (data?.signedUrl) signedUrlMap.set(path, data.signedUrl)
      })
    )

    const resolveUrl = (value: string | null): string | null => {
      if (!value) return null
      if (value.startsWith('http')) return value
      return signedUrlMap.get(value) || null
    }

    const formattedMessages = visibleMessages.map(msg => {
      const reactions = reactionsMap.get(msg.id) || []
      const reactionCounts: Record<string, { count: number; userIds: string[] }> = {}
      for (const r of reactions) {
        if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, userIds: [] }
        reactionCounts[r.emoji].count++
        reactionCounts[r.emoji].userIds.push(r.userId)
      }

      const replyToData = msg.reply_to_message_id ? replyToMap.get(msg.reply_to_message_id) : null
      const replyToProfile = replyToData ? profileMap.get(replyToData.senderId) : null

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
        reply_to_message_id: msg.reply_to_message_id || null,
        reply_to: replyToData ? {
          id: replyToData.id,
          content: replyToData.content,
          senderName: replyToProfile?.display_name || 'Unknown',
          messageType: replyToData.messageType,
          media_url: resolveUrl(replyToData.thumbnailUrl || replyToData.mediaUrl),
        } : null,
        reactions: reactionCounts,
        my_reaction: reactions.find(r => r.userId === user.id)?.emoji || null,
      }
    })

    return { messages: formattedMessages }
  } catch {
    return { messages: [] }
  }
}

export async function markConversationAsRead(conversationId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !conversationId) {
      return
    }

    await supabase
      .from('conversation_participants')
      .update({ unread_count: 0, last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
  } catch {
    // Silent fail
  }
}

export async function getUnreadMessageCount() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return 0
    }

    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('unread_count')
      .eq('user_id', user.id)

    return participants?.reduce((sum, p) => sum + (p.unread_count || 0), 0) || 0
  } catch {
    return 0
  }
}

// =============================================
// REACTIONS
// =============================================

export async function addReaction(messageId: string, emoji: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Not authenticated' }
    if (!messageId || !emoji) return { error: 'Invalid input' }

    // Verify message exists and user is participant
    const { data: message } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', messageId)
      .single()

    if (!message) return { error: 'Message not found' }

    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', message.conversation_id)
      .eq('user_id', user.id)
      .single()

    if (!participant) return { error: 'Unauthorized' }

    // Check for existing reaction
    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id, emoji')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      if (existing.emoji === emoji) {
        // Same emoji — remove (toggle off)
        await supabase.from('message_reactions').delete().eq('id', existing.id)
        return { success: true, action: 'removed', emoji }
      } else {
        // Different emoji — swap
        await supabase.from('message_reactions').update({ emoji }).eq('id', existing.id)
        return { success: true, action: 'swapped', emoji }
      }
    }

    // No existing reaction — insert
    const { error } = await supabase
      .from('message_reactions')
      .insert({ message_id: messageId, user_id: user.id, emoji })

    if (error) return { error: 'Failed to add reaction' }
    return { success: true, action: 'added', emoji }
  } catch {
    return { error: 'Failed to add reaction' }
  }
}

export async function removeReaction(messageId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Not authenticated' }

    await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)

    return { success: true }
  } catch {
    return { error: 'Failed to remove reaction' }
  }
}

export async function getMessageReactions(messageId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { reactions: {} }

    const { data } = await supabase
      .from('message_reactions')
      .select('emoji, user_id')
      .eq('message_id', messageId)

    if (!data) return { reactions: {} }

    const reactionCounts: Record<string, { count: number; userIds: string[] }> = {}
    for (const r of data) {
      if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, userIds: [] }
      reactionCounts[r.emoji].count++
      reactionCounts[r.emoji].userIds.push(r.user_id)
    }

    return { reactions: reactionCounts }
  } catch {
    return { reactions: {} }
  }
}

// =============================================
// DELETE MESSAGE
// =============================================

export async function deleteMessage(messageId: string, deleteForEveryone: boolean) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Not authenticated' }
    if (!messageId) return { error: 'Invalid message ID' }

    const { data: message } = await supabase
      .from('messages')
      .select('id, sender_id, created_at, media_url, thumbnail_url')
      .eq('id', messageId)
      .single()

    if (!message) return { error: 'Message not found' }

    if (deleteForEveryone) {
      // Only sender can delete for everyone, within 10 minutes
      if (message.sender_id !== user.id) {
        return { error: 'You can only delete your own messages' }
      }

      const messageAge = Date.now() - new Date(message.created_at).getTime()
      const tenMinutes = 10 * 60 * 1000

      if (messageAge > tenMinutes) {
        return { error: 'Can only delete for everyone within 10 minutes' }
      }

      // Soft delete: replace content, clear media
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
        .eq('id', messageId)

      if (error) return { error: 'Failed to delete message' }
      return { success: true, action: 'deleted_for_everyone' }
    } else {
      // Delete for me only: add user to deleted_for array
      const { data: current } = await supabase
        .from('messages')
        .select('deleted_for')
        .eq('id', messageId)
        .single()

      const deletedFor = current?.deleted_for || []
      if (!deletedFor.includes(user.id)) {
        deletedFor.push(user.id)
      }

      const { error } = await supabase
        .from('messages')
        .update({ deleted_for: deletedFor })
        .eq('id', messageId)

      if (error) return { error: 'Failed to delete message' }
      return { success: true, action: 'deleted_for_me' }
    }
  } catch {
    return { error: 'Failed to delete message' }
  }
}

// =============================================
// REPORT MESSAGE (stub)
// =============================================

export async function reportMessage(_messageId: string) {
  return { success: true, message: 'Report system coming soon' }
}
