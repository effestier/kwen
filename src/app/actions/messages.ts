'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function sendMessage(conversationId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (!content.trim()) {
    return { error: 'Message cannot be empty' }
  }

  // Insert message
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update conversation's updated_at
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  revalidatePath('/messages')
  return { success: true, message }
}

export async function getOrCreateConversation(otherUserId: string) {

  const supabase = await createClient()

  // Step 1: Get current user

  // First, check if there's a session via getSession
  const { data: sessionData } = await supabase.auth.getSession()

  // Also try getUser
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError) {
    return { error: 'Auth error: ' + authError.message }
  }

  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (user.id === otherUserId) {
    return { error: 'Cannot message yourself' }
  }


  // Step 2: Verify target user exists
  const { data: targetUser, error: targetError } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', otherUserId)
    .single()


  if (targetError || !targetUser) {
    return { error: 'Target user not found' }
  }

  // Step 3: Check if conversation already exists
  const { data: existing, error: existingError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', user.id)


  if (existing && existing.length > 0) {
    const conversationIds = existing.map(p => p.conversation_id)

    // Find conversation that includes the other user
    const { data: found, error: foundError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .eq('user_id', otherUserId)
      .single()


    if (found) {
      return { conversationId: found.conversation_id }
    }
  }

  // Step 4: Create new conversation
  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({})
    .select()
    .single()


  if (error || !conversation) {
    return { error: error?.message || 'Failed to create conversation' }
  }


  // Step 5: Add current user as participant
  const { error: partError1 } = await supabase
    .from('conversation_participants')
    .insert({
      conversation_id: conversation.id,
      user_id: user.id,
      unread_count: 0,
    })


  if (partError1) {
    return { error: partError1.message }
  }

  // Step 6: Add other user as participant
  const { error: partError2 } = await supabase
    .from('conversation_participants')
    .insert({
      conversation_id: conversation.id,
      user_id: otherUserId,
      unread_count: 0,
    })


  if (partError2) {
    return { error: partError2.message }
  }

  return { conversationId: conversation.id }
}

export async function markConversationAsRead(conversationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Update last_read_at and reset unread_count
  await supabase
    .from('conversation_participants')
    .update({
      last_read_at: new Date().toISOString(),
      unread_count: 0,
    })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)

  revalidatePath('/messages')
  return { success: true }
}

export async function getMessages(conversationId: string, limit = 50, cursor?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  let query = supabase
    .from('messages')
    .select('id, content, sender_id, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: messages, error } = await query

  if (error) {
    return { error: error.message }
  }

  // Get sender profiles
  const senderIds = [...new Set(messages?.map(m => m.sender_id) || [])]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', senderIds)

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

  const formattedMessages = (messages || []).reverse().map(m => ({
    id: m.id,
    content: m.content,
    senderId: m.sender_id,
    createdAt: m.created_at,
    isMine: m.sender_id === user.id,
    sender: profileMap.get(m.sender_id),
  }))

  return { messages: formattedMessages }
}