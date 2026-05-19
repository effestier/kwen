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
 * Verifies user is authenticated. Conversation participant check
 * is done at the message level (getMessages), not per-URL.
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

    const { data, error } = await supabase.storage
      .from('messages')
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)

    if (error || !data?.signedUrl) {
      return { error: error?.message || 'Failed to generate signed URL' }
    }

    return { url: data.signedUrl }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function sendMessage(conversationId: string, content: string, media?: MediaMetadata) {
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

    // Must have either content or media
    if (!cleanContent && !media?.path) {
      return { error: 'Message cannot be empty' }
    }

    // Verify user is participant in conversation
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (!participant) {
      return { error: 'Unauthorized' }
    }

    // Determine message type and content
    const messageType = media?.path ? (cleanContent ? 'mixed' : 'image') : 'text'
    const messageContent = cleanContent || (media?.path ? 'Photo' : '')

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
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
      })
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

    // Verify user is participant
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
      .select('id, content, sender_id, created_at, message_type, media_url, thumbnail_url, mime_type, file_size, media_width, media_height')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error || !messages) {
      return { messages: [] }
    }

    const senderIds = [...new Set(messages.map(m => m.sender_id))]

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', senderIds)

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

    // Collect unique storage paths that need signed URLs
    const pathsToSign = new Set<string>()
    for (const msg of messages) {
      if (msg.media_url && !msg.media_url.startsWith('http')) pathsToSign.add(msg.media_url)
      if (msg.thumbnail_url && !msg.thumbnail_url.startsWith('http')) pathsToSign.add(msg.thumbnail_url)
    }

    // Batch generate signed URLs
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
      if (value.startsWith('http')) return value // legacy URL
      return signedUrlMap.get(value) || null
    }

    const formattedMessages = messages.map(msg => ({
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
    }))

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

// cleanupOrphanedMedia() removed: any authenticated user could trigger mass deletion.
// Orphan cleanup is handled by the cleanup_message_media() trigger (migration 017).
// For edge cases (upload-without-message), run this SQL via Supabase Dashboard or cron:
//
// WITH orphaned AS (
//   SELECT o.name
//   FROM storage.objects o
//   WHERE o.bucket_id = 'messages'
//     AND o.name LIKE '%.webp'
//     AND NOT EXISTS (
//       SELECT 1 FROM public.messages m
//       WHERE m.media_url LIKE '%' || o.name
//          OR m.thumbnail_url LIKE '%' || o.name
//     )
//   LIMIT 100
// )
// DELETE FROM storage.objects
// WHERE bucket_id = 'messages'
//   AND name IN (SELECT name FROM orphaned);
