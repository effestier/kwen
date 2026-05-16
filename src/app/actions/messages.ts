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
  console.error('[MESSAGING] Starting getOrCreateConversation...')
  console.error('[MESSAGING] otherUserId:', otherUserId, 'type:', typeof otherUserId)

  const supabase = await createClient()
  console.error('[MESSAGING] Supabase client created')

  // Step 1: Get current user
  console.error('[MESSAGING] Step 1: Getting auth user...')

  // First, check if there's a session via getSession
  const { data: sessionData } = await supabase.auth.getSession()
  console.error('[MESSAGING] getSession result:', JSON.stringify({ hasSession: !!sessionData?.session, userId: sessionData?.session?.user?.id }))

  // Also try getUser
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.error('[MESSAGING] getUser result:', JSON.stringify({ userId: user?.id, authError }))

  if (authError) {
    console.error('[MESSAGING] Auth error:', JSON.stringify(authError, null, 2))
    return { error: 'Auth error: ' + authError.message }
  }

  if (!user) {
    console.error('[MESSAGING] No user - not authenticated')
    console.error('[MESSAGING] Session info:', JSON.stringify(sessionData))
    return { error: 'Not authenticated' }
  }

  if (user.id === otherUserId) {
    console.error('[MESSAGING] Cannot message yourself')
    return { error: 'Cannot message yourself' }
  }

  console.error('[MESSAGING] Current user:', user.id)
  console.error('[MESSAGING] Target user:', otherUserId)

  // Step 2: Verify target user exists
  console.error('[MESSAGING] Step 2: Verifying target user exists...')
  const { data: targetUser, error: targetError } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', otherUserId)
    .single()

  console.error('[MESSAGING] Target user lookup:', JSON.stringify({ targetUser, targetError }))

  if (targetError || !targetUser) {
    console.error('[MESSAGING] Target user not found:', JSON.stringify(targetError, null, 2))
    return { error: 'Target user not found' }
  }

  // Step 3: Check if conversation already exists
  console.error('[MESSAGING] Step 3: Checking existing conversations...')
  const { data: existing, error: existingError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', user.id)

  console.error('[MESSAGING] Existing conversations:', JSON.stringify({ count: existing?.length, existingError }))

  if (existing && existing.length > 0) {
    const conversationIds = existing.map(p => p.conversation_id)
    console.error('[MESSAGING] Checking for existing conv with target user among:', conversationIds.length, 'conversations')

    // Find conversation that includes the other user
    const { data: found, error: foundError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .eq('user_id', otherUserId)
      .single()

    console.error('[MESSAGING] Found existing conv:', JSON.stringify({ found, foundError }))

    if (found) {
      console.error('[MESSAGING] Returning existing conversation:', found.conversation_id)
      return { conversationId: found.conversation_id }
    }
  }

  // Step 4: Create new conversation
  console.error('[MESSAGING] Step 4: Creating new conversation...')
  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({})
    .select()
    .single()

  console.error('[MESSAGING] Conversation insert result:', JSON.stringify({ conversation, error: error ? { message: error.message, details: error.details, hint: error.hint } : null }))

  if (error || !conversation) {
    console.error('[MESSAGING] CONVERSATION INSERT FAILED:', JSON.stringify(error, null, 2))
    return { error: error?.message || 'Failed to create conversation' }
  }

  console.error('[MESSAGING] Created conversation:', conversation.id)

  // Step 5: Add current user as participant
  console.error('[MESSAGING] Step 5: Adding participant 1 (current user)...')
  const { error: partError1 } = await supabase
    .from('conversation_participants')
    .insert({
      conversation_id: conversation.id,
      user_id: user.id,
      unread_count: 0,
    })

  console.error('[MESSAGING] Participant 1 insert:', JSON.stringify({ partError1 }))

  if (partError1) {
    console.error('[MESSAGING] PARTICIPANT 1 INSERT FAILED:', JSON.stringify(partError1, null, 2))
    return { error: partError1.message }
  }

  // Step 6: Add other user as participant
  console.error('[MESSAGING] Step 6: Adding participant 2 (target user)...')
  const { error: partError2 } = await supabase
    .from('conversation_participants')
    .insert({
      conversation_id: conversation.id,
      user_id: otherUserId,
      unread_count: 0,
    })

  console.error('[MESSAGING] Participant 2 insert:', JSON.stringify({ partError2 }))

  if (partError2) {
    console.error('[MESSAGING] PARTICIPANT 2 INSERT FAILED:', JSON.stringify(partError2, null, 2))
    return { error: partError2.message }
  }

  console.error('[MESSAGING] SUCCESS - returning conversation:', conversation.id)
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