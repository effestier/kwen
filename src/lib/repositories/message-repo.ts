import { createClient } from '@/lib/supabase/server'

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  deleted_at: string | null
}

export interface MessageWithSender extends Message {
  sender_username: string
  sender_display_name: string
  sender_avatar_url: string | null
}

export interface Conversation {
  id: string
  created_at: string
  updated_at: string
  other_user?: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  }
  last_message?: string
  unread_count: number
}

export class MessageRepository {
  private supabase = createClient

  async getConversations(userId: string): Promise<Conversation[]> {
    const supabase = await this.supabase()

    // Get conversations where user is participant
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('conversation_id, unread_count, last_read_at')
      .eq('user_id', userId)
      .order('last_read_at', { ascending: false })

    if (!participants || participants.length === 0) return []

    const conversationIds = participants.map(p => p.conversation_id)
    const participantMap = new Map(participants.map(p => [p.conversation_id, p]))

    // Get conversations
    const { data: conversations } = await supabase
      .from('conversations')
      .select('*')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false })

    if (!conversations) return []

    // Get other participants
    const { data: allParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, unread_count')
      .in('conversation_id', conversationIds)
      .neq('user_id', userId)

    const otherUserIds = [...new Set(allParticipants?.map(p => p.user_id) || [])]

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', otherUserIds)

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
    const otherMap = new Map(allParticipants?.map(p => [p.conversation_id, p]) || [])

    // Get last messages
    const { data: lastMessages } = await supabase
      .from('messages')
      .select('conversation_id, content')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })

    const lastMessageMap = new Map<string, string>()
    lastMessages?.forEach(m => {
      if (!lastMessageMap.has(m.conversation_id)) {
        lastMessageMap.set(m.conversation_id, m.content)
      }
    })

    return conversations.map(c => {
      const otherParticipant = otherMap.get(c.id)
      const profile = otherParticipant ? profileMap.get(otherParticipant.user_id) : null
      const participant = participantMap.get(c.id)

      return {
        id: c.id,
        created_at: c.created_at,
        updated_at: c.updated_at,
        other_user: profile ? {
          id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        } : undefined,
        last_message: lastMessageMap.get(c.id),
        unread_count: participant?.unread_count || 0,
      }
    })
  }

  async getMessages(conversationId: string, userId: string, limit = 50, cursor?: string): Promise<MessageWithSender[]> {
    const supabase = await this.supabase()

    // Verify user is participant
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .single()

    if (!participant) return []

    let query = supabase
      .from('messages')
      .select('*, sender:profiles!inner(id, username, display_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data, error } = await query
    if (error || !data) return []

    return data.map(m => ({
      ...m,
      sender_username: m.sender?.username || '',
      sender_display_name: m.sender?.display_name || '',
      sender_avatar_url: m.sender?.avatar_url || null,
    }))
  }

  async send(conversationId: string, senderId: string, content: string): Promise<Message | null> {
    const supabase = await this.supabase()

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
      })
      .select()
      .single()

    if (error) return null

    // Update conversation updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    // Update unread count for other participants
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_id, unread_count')
      .eq('conversation_id', conversationId)
      .neq('user_id', senderId)

    if (participants) {
      for (const p of participants) {
        await supabase
          .from('conversation_participants')
          .update({ unread_count: p.unread_count + 1 })
          .eq('conversation_id', conversationId)
          .eq('user_id', p.user_id)
      }
    }

    return data as Message
  }

  async createConversation(userId: string, otherUserId: string): Promise<string | null> {
    const supabase = await this.supabase()

    // Check if conversation already exists
    const { data: existing } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId)

    if (existing) {
      // Find common conversation
      const { data: other } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', otherUserId)

      const userConvs = new Set(existing.map(e => e.conversation_id))
      const otherConvs = new Set(other?.map(o => o.conversation_id) || [])

      const common = [...userConvs].filter(c => otherConvs.has(c))
      if (common.length > 0) return common[0]
    }

    // Create new conversation
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({})
      .select()
      .single()

    if (error || !conversation) return null

    // Add participants
    await supabase
      .from('conversation_participants')
      .insert([
        { conversation_id: conversation.id, user_id: userId },
        { conversation_id: conversation.id, user_id: otherUserId },
      ])

    return conversation.id
  }

  async markAsRead(conversationId: string, userId: string): Promise<boolean> {
    const supabase = await this.supabase()

    const { error } = await supabase
      .from('conversation_participants')
      .update({
        unread_count: 0,
        last_read_at: new Date().toISOString(),
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)

    return !error
  }
}