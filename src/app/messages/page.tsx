'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils';
import Link from 'next/link';
import { getMessages, sendMessage, markConversationAsRead } from '@/app/actions/messages';

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  isMine: boolean;
  sender: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

interface Conversation {
  id: string;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  last_message: string | null;
  unread_count: number;
  updated_at: string;
}

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // User state - stable after initial load
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  // Refs for values needed in callbacks (avoid stale closures)
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const sentTempIdsRef = useRef<Set<string>>(new Set());
  const otherUserProfileRef = useRef<UserProfile | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const currentUserProfileRef = useRef<UserProfile | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const isSubscribedRef = useRef<boolean>(false);

  const supabase = createClient();

  // Keep refs in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    currentUserProfileRef.current = currentUserProfile;
  }, [currentUserProfile]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Get current user + profile on mount (only once)
  useEffect(() => {
    async function initUser() {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('id', user.id)
          .single();

        if (profile) {
          setCurrentUserProfile(profile);
        }
      }
    }

    initUser();
  }, []); // Empty deps - only run once

  // Helper to deduplicate messages
  const deduplicateMessages = useCallback((newMessages: Message[]): Message[] => {
    const seen = new Set<string>();
    return newMessages.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, []);

  // Load conversations (runs once on mount)
  useEffect(() => {
    async function loadConversations() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('conversation_id, unread_count, last_read_at')
        .eq('user_id', user.id)
        .order('last_read_at', { ascending: false })
        .limit(20);

      if (!participants || participants.length === 0) {
        setLoading(false);
        return;
      }

      const conversationIds = participants.map(p => p.conversation_id);
      const participantMap = new Map(participants.map(p => [p.conversation_id, p]));

      const { data: others } = await supabase
        .from('conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', conversationIds)
        .neq('user_id', user.id);

      const otherUserIds = [...new Set(others?.map(o => o.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', otherUserIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const otherMap = new Map(others?.map(o => [o.conversation_id, o]) || []);

      const { data: lastMessages } = await supabase
        .from('messages')
        .select('conversation_id, content, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false });

      const lastMessageMap = new Map<string, { content: string; created_at: string }>();
      lastMessages?.forEach(m => {
        if (!lastMessageMap.has(m.conversation_id)) {
          lastMessageMap.set(m.conversation_id, { content: m.content, created_at: m.created_at });
        }
      });

      const { data: convs } = await supabase
        .from('conversations')
        .select('id, updated_at')
        .in('id', conversationIds);

      setConversations(convs?.map(c => {
        const other = otherMap.get(c.id);
        const participant = participantMap.get(c.id);
        const lastMsg = lastMessageMap.get(c.id);
        const profile = other ? profileMap.get(other.user_id) : null;

        return {
          id: c.id,
          other_user: profile ? {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          } : null,
          last_message: lastMsg?.content || 'Start a conversation',
          unread_count: participant?.unread_count || 0,
          updated_at: lastMsg?.created_at || c.updated_at,
        };
      }) || []);

      setLoading(false);
    }

    loadConversations();

    // Subscribe to conversation list updates (not messages!)
    const convChannel = supabase
      .channel('conversations-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversation_participants',
      }, () => {
        // Don't reload - just update unread counts in place
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const msg = payload.new as { id: string; conversation_id: string; content: string; sender_id: string; created_at: string };
        setConversations(prev => {
          const exists = prev.some(c => c.id === msg.conversation_id);
          if (!exists) return prev;
          return prev.map(c => {
            if (c.id === msg.conversation_id) {
              return {
                ...c,
                last_message: msg.content,
                updated_at: msg.created_at,
                unread_count: msg.sender_id !== currentUserIdRef.current ? (c.unread_count || 0) + 1 : 0,
              };
            }
            return c;
          }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
    };
  }, []); // Empty deps - only run once on mount

  // Handle conversation selection - separate from message loading
  const handleSelectConversation = useCallback((conv: Conversation) => {
    if (conv.other_user) {
      otherUserProfileRef.current = conv.other_user;
    }
    setSelectedId(conv.id);
    setShowMobileChat(true);
    // Reset messages when switching conversations
    setMessages([]);
  }, []);

  // Load messages when selectedId changes - runs once per conversation change
  useEffect(() => {
    // Guard - need valid state
    if (!selectedId || !currentUserId || !currentUserProfile) {
      return;
    }

    // Skip if already subscribed to this conversation
    if (isSubscribedRef.current && messageChannelRef.current) {
      return;
    }

    let cancelled = false;

    async function loadMessagesAndSubscribe() {
      // Clear previous state
      sentTempIdsRef.current.clear();
      setMessages([]);
      setLoadingMessages(true);
      isSubscribedRef.current = false;

      // Clean up existing channels
      if (messageChannelRef.current) {
        supabase.removeChannel(messageChannelRef.current);
        messageChannelRef.current = null;
      }
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      }

      // Load messages
      const result = await getMessages(selectedId as string);

      if (!cancelled && result.messages) {
        const enriched = result.messages.map(m => ({
          ...m,
          sender: (m.isMine && currentUserProfile) ? currentUserProfile :
                  (!m.isMine && otherUserProfileRef.current) ? otherUserProfileRef.current :
                  (m.sender ?? null),
        }));
        setMessages(deduplicateMessages(enriched));
      }

      if (cancelled) return;

      setLoadingMessages(false);

      // Mark as read
      await markConversationAsRead(selectedId as string);
      setConversations(prev => prev.map(c =>
        c.id === selectedId ? { ...c, unread_count: 0 } : c
      ));

      // Set up realtime subscription for messages
      const messageChannel = supabase
        .channel(`messages-${selectedId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedId}`,
        }, async (payload) => {
          if (cancelled) return;

          const newMsg = payload.new as { id: string; content: string; sender_id: string; created_at: string };
          const currentMessages = messagesRef.current;
          const currentUserIdVal = currentUserIdRef.current;
          const currentUserProfileVal = currentUserProfileRef.current;
          const otherUserProfileVal = otherUserProfileRef.current;

          // Skip if already have this message
          if (currentMessages.some(m => m.id === newMsg.id)) {
            return;
          }

          // Skip if this is a temp message we sent
          if (sentTempIdsRef.current.has(newMsg.id)) {
            return;
          }

          // Determine sender profile
          let senderProfile: UserProfile | null = null;

          if (newMsg.sender_id === currentUserIdVal && currentUserProfileVal) {
            senderProfile = currentUserProfileVal;
          } else if (newMsg.sender_id !== currentUserIdVal && otherUserProfileVal) {
            senderProfile = otherUserProfileVal;
          } else {
            const { data: fetchedProfile } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .eq('id', newMsg.sender_id)
              .single();

            senderProfile = fetchedProfile;
          }

          const formattedMessage: Message = {
            id: newMsg.id,
            content: newMsg.content,
            senderId: newMsg.sender_id,
            createdAt: newMsg.created_at,
            isMine: newMsg.sender_id === currentUserIdVal,
            sender: senderProfile,
          };

          // Just append - don't reload
          setMessages(prev => deduplicateMessages([...prev, formattedMessage]));

          // Mark as read if not my message
          if (newMsg.sender_id !== currentUserIdVal) {
            await markConversationAsRead(selectedIdRef.current!);
            setConversations(prev => prev.map(c =>
              c.id === selectedIdRef.current ? { ...c, unread_count: 0 } : c
            ));
          }
        })
        .subscribe();

      messageChannelRef.current = messageChannel;
      isSubscribedRef.current = true;

      // Separate typing presence channel
      const typingChannel = supabase
        .channel(`typing-${selectedId}`)
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return;
          const state = typingChannel.presenceState();
          const typing = new Set<string>();
          Object.values(state).forEach((users: unknown) => {
            (users as Array<{ user_id: string; display_name: string }>).forEach((u) => {
              if (u.user_id !== currentUserIdRef.current) {
                typing.add(u.display_name || 'User');
              }
            });
          });
          setTypingUsers(typing);
        })
        .subscribe(async (status) => {
          if (cancelled || status !== 'SUBSCRIBED') return;
          await typingChannel.track({
            user_id: currentUserIdRef.current,
            display_name: 'Me',
          });
        });

      typingChannelRef.current = typingChannel;
    }

    loadMessagesAndSubscribe();

    // Cleanup function
    return () => {
      cancelled = true;
      isSubscribedRef.current = false;

      if (messageChannelRef.current) {
        supabase.removeChannel(messageChannelRef.current);
        messageChannelRef.current = null;
      }
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      }
    };
  }, [selectedId, currentUserId, currentUserProfile, deduplicateMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]); // Only trigger on length change, not on every message

  // Track typing
  const handleTyping = useCallback(async () => {
    const sid = selectedIdRef.current;
    const uid = currentUserIdRef.current;
    const tc = typingChannelRef.current;

    if (!sid || !uid || !tc) return;

    await tc.track({
      user_id: uid,
      display_name: 'Me',
      typing_at: Date.now(),
    });
  }, []); // Empty deps - use refs inside

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const sid = selectedIdRef.current;
    const uid = currentUserIdRef.current;
    const profile = currentUserProfileRef.current;
    const tid = sentTempIdsRef.current;

    if (!newMessage.trim() || !sid || sending || !uid || !profile) return;

    // Optimistic update
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tid.add(tempId);

    const tempMessage: Message = {
      id: tempId,
      content: newMessage,
      senderId: uid,
      createdAt: new Date().toISOString(),
      isMine: true,
      sender: profile,
    };

    setMessages(prev => deduplicateMessages([...prev, tempMessage]));
    setSending(true);

    const result = await sendMessage(sid, newMessage);

    if (result.success && result.message) {
      tid.delete(tempId);
      setMessages(prev => deduplicateMessages(prev.map(m =>
        m.id === tempId ? {
          ...m,
          id: result.message!.id,
          createdAt: result.message!.created_at,
        } : m
      )));
      setNewMessage('');
    } else {
      tid.delete(tempId);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
    setSending(false);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'now';
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const selectedConversation = conversations.find(c => c.id === selectedId);

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-57px)]">
        {/* Conversations List */}
        <div className={cn(
          "w-full md:w-80 border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-secondary)]",
          showMobileChat && 'hidden md:flex'
        )}>
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h1 className="text-xl font-bold text-white">Messages</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-[var(--text-muted)]">Loading...</div>
            ) : conversations.length > 0 ? (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors-fast',
                    selectedId === conv.id && 'bg-[var(--bg-tertiary)]'
                  )}
                >
                  <Avatar
                    src={conv.other_user?.avatar_url || null}
                    name={conv.other_user?.display_name || 'User'}
                    size="md"
                  />
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={cn(
                        'text-sm font-semibold truncate',
                        conv.unread_count > 0 ? 'text-white' : 'text-[var(--text-secondary)]'
                      )}>
                        {conv.other_user?.display_name || 'User'}
                      </p>
                      <span className="text-xs text-[var(--text-muted)]">{formatTime(conv.updated_at)}</span>
                    </div>
                    <p className={cn(
                      'text-sm truncate',
                      conv.unread_count > 0 ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'
                    )}>
                      {conv.last_message}
                    </p>
                  </div>
                  {conv.unread_count > 0 && (
                    <div className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white text-xs font-bold flex items-center justify-center">
                      {conv.unread_count}
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-[var(--text-muted)]">
                <p className="mb-4">No conversations yet</p>
                <Link href="/explore" className="text-[var(--accent-primary)] text-sm hover:underline">
                  Find people to message
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={cn(
          'flex-1 flex flex-col bg-[var(--bg-primary)]',
          !showMobileChat && 'hidden md:flex'
        )}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
                <button
                  onClick={() => setShowMobileChat(false)}
                  className="md:hidden p-2 -ml-2 hover:bg-[var(--bg-secondary)] rounded-full"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <Avatar
                  src={selectedConversation.other_user?.avatar_url || null}
                  name={selectedConversation.other_user?.display_name || 'User'}
                  size="md"
                />
                <div className="flex-1">
                  <Link href={`/profile/${selectedConversation.other_user?.username}`} className="font-semibold text-white hover:underline">
                    {selectedConversation.other_user?.display_name || 'User'}
                  </Link>
                  {typingUsers.size > 0 && (
                    <p className="text-xs text-[var(--accent-primary)]">typing...</p>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="text-center text-[var(--text-muted)]">Loading messages...</div>
                ) : messages.length > 0 ? (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex gap-2',
                        msg.isMine ? 'flex-row-reverse' : 'flex-row'
                      )}
                    >
                      <Avatar
                        src={msg.sender?.avatar_url || null}
                        name={msg.sender?.display_name || 'User'}
                        size="sm"
                      />
                      <div className={cn(
                        'max-w-[70%] px-4 py-2 rounded-2xl',
                        msg.isMine
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                      )}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={cn(
                          'text-xs mt-1',
                          msg.isMine ? 'text-white/70' : 'text-[var(--text-muted)]'
                        )}>
                          {formatTimeAgo(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-[var(--text-muted)]">
                    <p>No messages yet</p>
                    <p className="text-sm">Send a message to start the conversation</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSend} className="p-4 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                    }}
                    placeholder="Message..."
                    disabled={!currentUserProfile}
                    className="flex-1 px-4 py-2.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-soft)] disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || sending || !currentUserProfile}
                    className="p-2.5 rounded-full bg-[var(--accent-primary)] text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <p className="text-[var(--text-muted)] mb-4">Select a conversation</p>
              <Link href="/explore" className="text-[var(--accent-primary)] text-sm hover:underline">
                Find new people
              </Link>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}