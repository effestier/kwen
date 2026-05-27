'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/avatar'

interface ShareStoryModalProps {
  storyId: string
  storyUrl: string
  storyUsername: string
  onClose: () => void
}

interface Conversation {
  id: string
  participant: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  }
}

export function ShareStoryModal({
  storyId,
  storyUrl,
  storyUsername,
  onClose,
}: ShareStoryModalProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function loadConversations() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get conversations where user is a participant
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id)

      if (!participations) {
        setLoading(false)
        return
      }

      const conversationIds = participations.map(p => p.conversation_id)

      // Get other participants in those conversations
      const { data: otherParticipants } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          user:profiles!user_id(id, username, display_name, avatar_url)
        `)
        .in('conversation_id', conversationIds)
        .neq('user_id', user.id)

      if (!otherParticipants) {
        setLoading(false)
        return
      }

      const convos: Conversation[] = otherParticipants.map(p => ({
        id: p.conversation_id,
        participant: p.user as any,
      }))

      setConversations(convos)
      setLoading(false)
    }

    loadConversations()
  }, [])

  const handleShare = async (conversationId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSending(conversationId)
    const message = `Check out ${storyUsername}'s story: ${window.location.origin}/${storyUsername}`

    // M13: Always include sender_id — user is guaranteed non-null above
    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: message,
        message_type: 'text',
        sender_id: user.id,
      })

    if (!error) {
      setSent([...sent, conversationId])
    }

    setSending(null)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="bg-[var(--bg-secondary)] sm:rounded-2xl rounded-t-2xl w-full sm:max-w-sm overflow-hidden animate-slideInUp sm:animate-none pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[var(--border-subtle)]" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <h3 className="font-semibold text-white">Share Story</h3>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Conversations list */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                  <div className="flex-1 h-4 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : conversations.length > 0 ? (
            conversations.map((convo) => (
              <button
                key={convo.id}
                onClick={() => handleShare(convo.id)}
                disabled={sending === convo.id || sent.includes(convo.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
              >
                <Avatar
                  src={convo.participant.avatar_url}
                  name={convo.participant.display_name}
                  size="sm"
                />
                <div className="flex-1 text-left">
                  <p className="text-white font-medium">
                    {convo.participant.display_name}
                  </p>
                  <p className="text-[var(--text-muted)] text-sm">
                    @{convo.participant.username}
                  </p>
                </div>
                {sending === convo.id ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : sent.includes(convo.id) ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--success)]">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-primary)]">
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                )}
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-[var(--text-muted)]">
              No conversations to share to
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
