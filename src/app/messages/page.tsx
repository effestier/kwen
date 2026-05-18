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
import type { MediaMetadata } from '@/app/actions/messages';
import { compressForMessage, generateThumbnail, validateRawFile } from '@/lib/image-compress';

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
  message_type?: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  media_width?: number | null;
  media_height?: number | null;
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
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [tappedMsgId, setTappedMsgId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // User state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  // Refs
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
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
  useEffect(() => { currentUserProfileRef.current = currentUserProfile; }, [currentUserProfile]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Get current user + profile on mount
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
        if (profile) setCurrentUserProfile(profile);
      }
    }
    initUser();
  }, []);

  const deduplicateMessages = useCallback((newMessages: Message[]): Message[] => {
    const seen = new Set<string>();
    return newMessages.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, []);

  // Load conversations
  useEffect(() => {
    async function loadConversations() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('conversation_id, unread_count, last_read_at')
        .eq('user_id', user.id)
        .order('last_read_at', { ascending: false })
        .limit(20);

      if (!participants || participants.length === 0) { setLoading(false); return; }

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
        .select('conversation_id, content, created_at, message_type')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false });

      const lastMessageMap = new Map<string, { content: string; created_at: string; message_type?: string }>();
      lastMessages?.forEach(m => {
        if (!lastMessageMap.has(m.conversation_id)) {
          lastMessageMap.set(m.conversation_id, { content: m.content, created_at: m.created_at, message_type: m.message_type });
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
          other_user: profile ? { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url } : null,
          last_message: lastMsg?.message_type === 'image' ? 'Photo' : lastMsg?.message_type === 'mixed' ? `Photo · ${lastMsg.content}` : (lastMsg?.content || 'Start a conversation'),
          unread_count: participant?.unread_count || 0,
          updated_at: lastMsg?.created_at || c.updated_at,
        };
      }) || []);

      setLoading(false);
    }

    loadConversations();

    const convChannel = supabase
      .channel('conversations-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as { id: string; conversation_id: string; content: string; sender_id: string; created_at: string; message_type?: string };
        setConversations(prev => {
          const exists = prev.some(c => c.id === msg.conversation_id);
          if (!exists) return prev;
          return prev.map(c => {
            if (c.id === msg.conversation_id) {
              const preview = msg.message_type === 'image' ? 'Photo' : msg.message_type === 'mixed' ? `Photo · ${msg.content}` : msg.content;
              return {
                ...c,
                last_message: preview,
                updated_at: msg.created_at,
                unread_count: msg.sender_id !== currentUserIdRef.current ? (c.unread_count || 0) + 1 : 0,
              };
            }
            return c;
          }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(convChannel); };
  }, []);

  // Handle conversation selection
  const handleSelectConversation = useCallback((conv: Conversation) => {
    if (conv.other_user) otherUserProfileRef.current = conv.other_user;
    setSelectedId(conv.id);
    setShowMobileChat(true);
    setMessages([]);
    setTappedMsgId(null);
  }, []);

  // Load messages when selectedId changes
  useEffect(() => {
    if (!selectedId || !currentUserId || !currentUserProfile) return;
    if (isSubscribedRef.current && messageChannelRef.current) return;

    let cancelled = false;

    async function loadMessagesAndSubscribe() {
      sentTempIdsRef.current.clear();
      setMessages([]);
      setLoadingMessages(true);
      isSubscribedRef.current = false;

      if (messageChannelRef.current) { supabase.removeChannel(messageChannelRef.current); messageChannelRef.current = null; }
      if (typingChannelRef.current) { supabase.removeChannel(typingChannelRef.current); typingChannelRef.current = null; }

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

      await markConversationAsRead(selectedId as string);
      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, unread_count: 0 } : c));

      const messageChannel = supabase
        .channel(`messages-${selectedId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` }, async (payload) => {
          if (cancelled) return;
          const newMsg = payload.new as { id: string; content: string; sender_id: string; created_at: string; message_type?: string; media_url?: string; thumbnail_url?: string; mime_type?: string; file_size?: number; media_width?: number; media_height?: number };
          if (messagesRef.current.some(m => m.id === newMsg.id)) return;
          if (sentTempIdsRef.current.has(newMsg.id)) return;

          let senderProfile: UserProfile | null = null;
          if (newMsg.sender_id === currentUserIdRef.current && currentUserProfileRef.current) {
            senderProfile = currentUserProfileRef.current;
          } else if (newMsg.sender_id !== currentUserIdRef.current && otherUserProfileRef.current) {
            senderProfile = otherUserProfileRef.current;
          } else {
            const { data: fetchedProfile } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', newMsg.sender_id).single();
            senderProfile = fetchedProfile;
          }

          const formattedMessage: Message = {
            id: newMsg.id,
            content: newMsg.content,
            senderId: newMsg.sender_id,
            createdAt: newMsg.created_at,
            isMine: newMsg.sender_id === currentUserIdRef.current,
            sender: senderProfile,
            message_type: newMsg.message_type || 'text',
            media_url: newMsg.media_url || null,
            thumbnail_url: newMsg.thumbnail_url || null,
            mime_type: newMsg.mime_type || null,
            file_size: newMsg.file_size || null,
            media_width: newMsg.media_width || null,
            media_height: newMsg.media_height || null,
          };
          setMessages(prev => deduplicateMessages([...prev, formattedMessage]));

          if (newMsg.sender_id !== currentUserIdRef.current) {
            await markConversationAsRead(selectedIdRef.current!);
            setConversations(prev => prev.map(c => c.id === selectedIdRef.current ? { ...c, unread_count: 0 } : c));
          }
        })
        .subscribe();

      messageChannelRef.current = messageChannel;
      isSubscribedRef.current = true;

      const typingChannel = supabase
        .channel(`typing-${selectedId}`)
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return;
          const state = typingChannel.presenceState();
          const typing = new Set<string>();
          Object.values(state).forEach((users: unknown) => {
            (users as Array<{ user_id: string; display_name: string }>).forEach((u) => {
              if (u.user_id !== currentUserIdRef.current) typing.add(u.display_name || 'User');
            });
          });
          setTypingUsers(typing);
        })
        .subscribe(async (status) => {
          if (cancelled || status !== 'SUBSCRIBED') return;
          await typingChannel.track({ user_id: currentUserIdRef.current, display_name: 'Me' });
        });

      typingChannelRef.current = typingChannel;
    }

    loadMessagesAndSubscribe();

    return () => {
      cancelled = true;
      isSubscribedRef.current = false;
      if (messageChannelRef.current) { supabase.removeChannel(messageChannelRef.current); messageChannelRef.current = null; }
      if (typingChannelRef.current) { supabase.removeChannel(typingChannelRef.current); typingChannelRef.current = null; }
    };
  }, [selectedId, currentUserId, currentUserProfile, deduplicateMessages]);

  // Scroll to bottom when messages change
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // Track typing
  const handleTyping = useCallback(async () => {
    const sid = selectedIdRef.current;
    const uid = currentUserIdRef.current;
    const tc = typingChannelRef.current;
    if (!sid || !uid || !tc) return;
    await tc.track({ user_id: uid, display_name: 'Me', typing_at: Date.now() });
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateRawFile(file);
    if (error) {
      alert(error);
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const clearImagePreview = () => {
    setImagePreview(null);
    setImageFile(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = selectedIdRef.current;
    const uid = currentUserIdRef.current;
    const profile = currentUserProfileRef.current;
    const tid = sentTempIdsRef.current;

    if ((!newMessage.trim() && !imageFile) || !sid || sending || !uid || !profile) return;

    setSending(true);
    let media: MediaMetadata | undefined;

    // Compress and upload image if present
    if (imageFile) {
      setUploadingImage(true);
      try {
        // 1. Compress image → WebP, max 1600px
        const compressed = await compressForMessage(imageFile);

        // 2. Generate thumbnail → WebP, 320px wide
        const thumbnail = await generateThumbnail(imageFile);

        // 3. Upload both to organized path (UID must be first segment for RLS policy)
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const basePath = `${uid}/conversations/${sid}`;
        const imagePath = `${basePath}/${timestamp}-${random}.webp`;
        const thumbPath = `${basePath}/${timestamp}-${random}-thumb.webp`;

        // Upload optimized image
        const { error: imgErr } = await supabase.storage
          .from('messages')
          .upload(imagePath, compressed.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'image/webp',
          });

        if (imgErr) {
          console.error('Image upload error:', imgErr);
          alert(imgErr.message || 'Failed to upload image.');
          setUploadingImage(false);
          setSending(false);
          return;
        }

        // Upload thumbnail
        const { error: thumbErr } = await supabase.storage
          .from('messages')
          .upload(thumbPath, thumbnail.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'image/webp',
          });

        if (thumbErr) {
          console.error('Thumbnail upload error:', thumbErr);
          // Thumbnail failure is non-fatal — use full image as fallback
        }

        const { data: imgUrlData } = supabase.storage.from('messages').getPublicUrl(imagePath);
        const { data: thumbUrlData } = supabase.storage.from('messages').getPublicUrl(thumbPath);

        media = {
          url: imgUrlData.publicUrl,
          thumbnailUrl: thumbErr ? imgUrlData.publicUrl : thumbUrlData.publicUrl,
          mimeType: 'image/webp',
          fileSize: compressed.file.size,
          width: compressed.width,
          height: compressed.height,
        };
      } catch (err) {
        console.error('Image processing error:', err);
        alert(err instanceof Error ? err.message : 'Failed to process image.');
        setUploadingImage(false);
        setSending(false);
        return;
      }
      setUploadingImage(false);
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tid.add(tempId);

    const displayContent = newMessage.trim() || (media ? 'Photo' : '');
    const messageType = media ? (newMessage.trim() ? 'mixed' : 'image') : 'text';

    const tempMessage: Message = {
      id: tempId,
      content: displayContent,
      senderId: uid,
      createdAt: new Date().toISOString(),
      isMine: true,
      sender: profile,
      message_type: messageType,
      media_url: media?.url || null,
      thumbnail_url: media?.thumbnailUrl || null,
      mime_type: media?.mimeType || null,
      file_size: media?.fileSize || null,
      media_width: media?.width || null,
      media_height: media?.height || null,
    };
    setMessages(prev => deduplicateMessages([...prev, tempMessage]));
    clearImagePreview();
    setNewMessage('');

    const result = await sendMessage(sid, displayContent, media);

    if (result.success && result.message) {
      tid.delete(tempId);
      setMessages(prev => deduplicateMessages(prev.map(m => m.id === tempId ? { ...m, id: result.message!.id, createdAt: result.message!.created_at } : m)));
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

  const handleMessageTap = (msgId: string) => {
    setTappedMsgId(prev => prev === msgId ? null : msgId);
  };

  const selectedConversation = conversations.find(c => c.id === selectedId);
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return (
    <MainLayout>
      {/* Expose unread count for sidebar/mobile nav to read */}
      <div id="messages-unread-count" data-count={totalUnread} className="hidden" />

      <div className="flex h-[calc(100vh-57px)]">
        {/* Conversations List */}
        <div className={cn(
          "w-full md:w-80 border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-primary)]",
          showMobileChat && 'hidden md:flex'
        )}>
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Messages</h1>
          </div>
          <div role="list" aria-label="Conversations" className="flex-1 overflow-y-auto">
            {loading ? (
              <div role="status" className="p-4 text-center text-[var(--text-muted)]">Loading...</div>
            ) : conversations.length > 0 ? (
              conversations.map((conv) => {
                const isUnread = conv.unread_count > 0;
                const isSelected = selectedId === conv.id;
                return (
                  <button
                    key={conv.id}
                    role="listitem"
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => handleSelectConversation(conv)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 transition-colors-fast text-left',
                      isSelected ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'
                    )}
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar
                        src={conv.other_user?.avatar_url || null}
                        name={conv.other_user?.display_name || 'User'}
                        size="md"
                      />
                      {isUnread && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--accent-primary)] border-2 border-[var(--bg-primary)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          'text-sm truncate',
                          isUnread ? 'font-bold text-[var(--text-primary)]' : 'font-medium text-[var(--text-secondary)]'
                        )}>
                          {conv.other_user?.display_name || 'User'}
                        </p>
                        <span className={cn(
                          'text-xs flex-shrink-0',
                          isUnread ? 'text-[var(--accent-primary)] font-medium' : 'text-[var(--text-muted)]'
                        )}>
                          {formatTime(conv.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={cn(
                          'text-sm truncate',
                          isUnread ? 'text-[var(--text-secondary)] font-medium' : 'text-[var(--text-muted)]'
                        )}>
                          {conv.last_message}
                        </p>
                        {isUnread && (
                          <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent-primary)] text-white text-xs font-bold flex items-center justify-center">
                            {conv.unread_count > 99 ? '99+' : conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-[var(--text-muted)]">
                <p className="mb-4">No conversations yet</p>
                <Link href="/explore" className="text-[var(--accent-primary)] text-sm hover:underline">Find people to message</Link>
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
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3">
                <button
                  onClick={() => setShowMobileChat(false)}
                  aria-label="Back to conversations"
                  className="md:hidden p-2 -ml-2 hover:bg-[var(--bg-secondary)] rounded-full transition-colors-fast"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <Avatar
                  src={selectedConversation.other_user?.avatar_url || null}
                  name={selectedConversation.other_user?.display_name || 'User'}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${selectedConversation.other_user?.username}`} className="font-semibold text-[var(--text-primary)] hover:underline text-sm">
                    {selectedConversation.other_user?.display_name || 'User'}
                  </Link>
                  {typingUsers.size > 0 && (
                    <p className="text-xs text-[var(--accent-primary)] animate-pulse">typing...</p>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div role="log" aria-label="Messages" aria-live="polite" className="flex-1 overflow-y-auto px-4 py-2">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-[var(--text-muted)]">Loading messages...</div>
                  </div>
                ) : messages.length > 0 ? (
                  <div className="py-2">
                    {messages.map((msg, i) => {
                      const showTimestamp = hoveredMsgId === msg.id || tappedMsgId === msg.id;
                      const prevMsg = i > 0 ? messages[i - 1] : null;
                      const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId;

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            'group relative w-full',
                            isConsecutive ? 'mt-[2px]' : 'mt-3',
                            'flex',
                            msg.isMine ? 'justify-end' : 'justify-start'
                          )}
                          onMouseEnter={() => setHoveredMsgId(msg.id)}
                          onMouseLeave={() => setHoveredMsgId(null)}
                          onClick={() => handleMessageTap(msg.id)}
                        >
                          {/* Avatar column - fixed width, only for first in group from other */}
                          {!msg.isMine && (
                            <div className="w-8 flex-shrink-0 mr-2">
                              {!isConsecutive && (
                                <Avatar
                                  src={msg.sender?.avatar_url || null}
                                  name={msg.sender?.display_name || 'User'}
                                  size="sm"
                                  className="mb-1"
                                />
                              )}
                            </div>
                          )}

                          {/* Bubble column - constrained max width */}
                          <div className={cn(
                            'flex flex-col',
                            msg.isMine ? 'items-end' : 'items-start',
                            msg.isMine
                              ? 'max-w-[75%] md:max-w-[65%]'
                              : 'max-w-[75%] md:max-w-[65%]'
                          )}>
                            {/* Message bubble */}
                            <div className={cn(
                              'text-sm min-w-0 overflow-hidden',
                              msg.isMine
                                ? 'bg-[var(--accent-primary)] text-white rounded-2xl rounded-br-md'
                                : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-2xl rounded-bl-md',
                              msg.media_url ? 'p-1' : 'px-3.5 py-2'
                            )}>
                              {msg.media_url && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setEnlargedImage(msg.media_url!); }}
                                  className="block w-full cursor-pointer"
                                  aria-label="View full image"
                                >
                                  <img
                                    src={msg.thumbnail_url || msg.media_url}
                                    alt={msg.content !== 'Photo' ? msg.content : 'Sent image'}
                                    className={cn(
                                      'max-w-full rounded-[14px] object-cover transition-opacity hover:opacity-90',
                                      msg.content && msg.content !== 'Photo' ? 'mb-1' : '',
                                      msg.message_type === 'image' ? 'max-h-[300px] w-full' : 'max-h-[250px]'
                                    )}
                                    loading="lazy"
                                    width={msg.media_width || undefined}
                                    height={msg.media_height || undefined}
                                  />
                                </button>
                              )}
                              {msg.content && msg.content !== 'Photo' && (
                                <p className={cn(
                                  'whitespace-pre-wrap text-sm',
                                  msg.media_url ? 'px-2.5 py-1.5' : ''
                                )} style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{msg.content}</p>
                              )}
                            </div>

                            {/* Timestamp - hidden by default, shown on hover/tap */}
                            <div className={cn(
                              'text-[10px] mt-0.5 px-1 transition-all duration-200',
                              msg.isMine ? 'text-right' : 'text-left',
                              showTimestamp
                                ? 'opacity-100 translate-y-0'
                                : 'opacity-0 translate-y-1 pointer-events-none',
                              'text-[var(--text-muted)]'
                            )}>
                              {formatTimeAgo(msg.createdAt)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-[var(--text-muted)]">
                      <p className="font-medium">No messages yet</p>
                      <p className="text-sm mt-1">Send a message to start the conversation</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSend} className="p-3 border-t border-[var(--border-subtle)]">
                {/* Image preview */}
                {imagePreview && (
                  <div className="mb-2 relative inline-block">
                    <img src={imagePreview} alt="Preview" className="max-h-[120px] rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={clearImagePreview}
                      aria-label="Remove image"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-muted)] flex items-center justify-center text-xs hover:text-[var(--text-primary)]"
                    >
                      &times;
                    </button>
                    {uploadingImage && (
                      <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                        <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageSelect}
                    className="hidden"
                    aria-label="Upload image"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || uploadingImage || !currentUserProfile}
                    aria-label="Attach image"
                    className="p-2.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors-fast disabled:opacity-30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                    </svg>
                  </button>
                  <label htmlFor="message-input" className="sr-only">Type a message</label>
                  <input
                    id="message-input"
                    type="text"
                    value={newMessage}
                    onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }}
                    placeholder="Message..."
                    aria-label="Type a message"
                    disabled={!currentUserProfile}
                    className="flex-1 px-4 py-2.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-50 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={(!newMessage.trim() && !imageFile) || sending || !currentUserProfile}
                    aria-label="Send message"
                    className="p-2.5 rounded-full bg-[var(--accent-primary)] text-white disabled:opacity-30 hover:opacity-90 transition-all active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                    </svg>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-[var(--text-muted)]">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="font-medium">Select a conversation</p>
              <Link href="/explore" className="text-[var(--accent-primary)] text-sm hover:underline mt-2">Find new people</Link>
            </div>
          )}
        </div>
      </div>

      {/* Image lightbox */}
      {enlargedImage && (
        <div
          role="dialog"
          aria-label="Image preview"
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <button
            onClick={() => setEnlargedImage(null)}
            aria-label="Close image"
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
          <img
            src={enlargedImage}
            alt="Full size image"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </MainLayout>
  );
}
