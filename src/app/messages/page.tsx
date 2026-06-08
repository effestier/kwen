'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { getMessages, getOlderMessages, sendMessage, markConversationAsRead, markMessagesAsDelivered, markMessagesAsSeen, getSignedUrl, addReaction, deleteMessage, reportMessage } from '@/services/messages';
import type { MediaMetadata } from '@/services/messages';
import { MessageBubble, type MessageBubbleData } from '@/components/messages/message-bubble';
import { compressForMessage, generateThumbnail, validateRawFile, verifyImageContent } from '@/lib/image-compress';
import { ListSkeleton, Skeleton } from '@/components/design-system/skeleton';
import { blockUser } from '@/services/posts';
import { VoiceRecorder } from '@/components/messages/voice-recorder';
import { LightboxModal } from '@/components/messages/lightbox-modal';
import { usePresence, formatLastSeen } from '@/hooks/use-presence';

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
  media_path?: string | null;
  media_url?: string | null;
  thumbnail_path?: string | null;
  thumbnail_url?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  media_width?: number | null;
  media_height?: number | null;
  reply_to_message_id?: string | null;
  reply_to?: {
    id: string;
    content: string;
    senderName: string;
    messageType: string;
    media_url: string | null;
  } | null;
  reactions: Record<string, { count: number; userIds: string[] }>;
  my_reaction: string | null;
  status?: 'sending' | 'sent' | 'failed';
  file?: File;
  duration?: number | null;
  delivered_at?: string | null;
  seen_at?: string | null;
}

interface FailedMessageData {
  content: string;
  media?: MediaMetadata;
  file?: File;
  blob?: Blob;
  duration?: number;
  replyToMessageId?: string;
}

interface Conversation {
  id: string;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_online?: boolean;
    last_seen_at?: string | null;
  } | null;
  last_message: string | null;
  last_message_raw?: string;
  last_message_is_mine?: boolean;
  last_message_delivered?: boolean;
  last_message_seen?: boolean;
  unread_count: number;
  updated_at: string;
  has_messages?: boolean;
  last_read_message_id?: string | null;
}

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_online?: boolean;
  last_seen_at?: string | null;
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(-1); // -1 = idle, 0-100 = uploading
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; mediaPath?: string } | null>(null);
  const [failedMessages, setFailedMessages] = useState<Map<string, FailedMessageData>>(new Map());
  const [replyTo, setReplyTo] = useState<MessageBubbleData | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadCountRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Map<string, string>>(new Map()); // conversationId -> matched message snippet
  const [searchingMessages, setSearchingMessages] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<MessageBubbleData | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);
  const [blockUserId, setBlockUserId] = useState<string | null>(null);
  const hasOpenedFromProfile = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea as user types, with max-height cap
  const TEXTAREA_MAX_HEIGHT = 180;
  const handleInputResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT);
    el.style.height = newHeight + 'px';
    // Only enable internal scroll when content exceeds max-height
    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    // Prevent layout shift by keeping scrollbar gutter stable
    el.style.scrollbarGutter = 'stable';
  }, []);

  // Read ?open= param synchronously (avoids useSearchParams Suspense requirement)
  const openConvId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('open') : null;


  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // User state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  // Presence
  const { onlineUsers, isOnline } = usePresence(currentUserId);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const reactionsChannelRef = useRef<RealtimeChannel | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const sentTempIdsRef = useRef<Set<string>>(new Set());
  const otherUserProfileRef = useRef<UserProfile | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const currentUserProfileRef = useRef<UserProfile | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const signedUrlCacheRef = useRef<Map<string, { url: string; expiresAt: number }>>(new Map());
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
  useEffect(() => { currentUserProfileRef.current = currentUserProfile; }, [currentUserProfile]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Auto-focus textarea when opening a conversation (but not on mobile to prevent automatic keyboard popup)
  useEffect(() => {
    if (selectedId && messageInputRef.current && !window.matchMedia('(max-width: 768px)').matches) {
      const timer = setTimeout(() => messageInputRef.current?.focus(), showMobileChat ? 300 : 100);
      return () => clearTimeout(timer);
    }
  }, [selectedId]);

  // User + conversations loaded together (merged to save one auth roundtrip)

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
    let cancelled = false;

    async function loadConversations() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      setCurrentUserId(user.id);

      // Fetch user profile + conversations via RPC in parallel
      const [profileRes, convsRes] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', user.id).single(),
        supabase.rpc('get_conversations_with_profiles', { p_user_id: user.id }),
      ]);

      if (!cancelled && profileRes.data) setCurrentUserProfile(profileRes.data);
      if (cancelled) return;

      if (convsRes.error) {
        console.error('[MESSAGES] RPC error:', convsRes.error);
        setLoadError(`Failed to load conversations: ${convsRes.error.message}`);
        setLoading(false);
        return;
      }

      const rows = (convsRes.data || []) as Array<{
        conversation_id: string;
        unread_count: number;
        updated_at: string;
        other_user_id: string | null;
        other_username: string | null;
        other_display_name: string | null;
        other_avatar_url: string | null;
        other_is_online: boolean | null;
        other_last_seen_at: string | null;
        last_message_content: string | null;
        last_message_type: string | null;
        last_message_created_at: string | null;
        last_message_sender_id: string | null;
      }>;

      setHasMoreConversations(rows.length > 20);
      const paged = rows.slice(0, 20);

      const convList: Conversation[] = paged
        .filter(r => r.last_message_content !== null) // only show conversations with messages
        .map(r => {
          const isLastMine = r.last_message_sender_id === user.id;
          const preview = r.last_message_type === 'image' ? '📷 Photo'
            : r.last_message_type === 'voice' ? '🎤 Voice message'
            : r.last_message_type === 'mixed' ? `📷 Photo · ${r.last_message_content}`
            : (r.last_message_content || '');

          return {
            id: r.conversation_id,
            other_user: r.other_user_id ? {
              id: r.other_user_id,
              username: r.other_username || '',
              display_name: r.other_display_name || 'User',
              avatar_url: r.other_avatar_url,
              is_online: r.other_is_online || false,
              last_seen_at: r.other_last_seen_at,
            } : null,
            last_message: isLastMine ? `You: ${preview}` : preview,
            last_message_raw: r.last_message_content || '',
            unread_count: r.unread_count || 0,
            updated_at: r.last_message_created_at || r.updated_at,
            has_messages: true,
          };
        });

      setConversations(convList);

      // Auto-open conversation from profile "Message" button
      if (openConvId && !hasOpenedFromProfile.current) {
        hasOpenedFromProfile.current = true;
        const targetConv = convList.find(c => c.id === openConvId);
        if (targetConv) {
          if (targetConv.other_user) otherUserProfileRef.current = targetConv.other_user;
          setSelectedId(openConvId);
          setShowMobileChat(true);
        } else {
          // New conversation — not in list yet. Don't add to list (only show after first message).
          // Just fetch the other user's profile so the chat header renders.
          const { data: otherParticipant } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', openConvId)
            .neq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          let otherProfile: Record<string, unknown> | null = null;
          if (otherParticipant?.user_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url, is_online, last_seen_at')
              .eq('id', otherParticipant.user_id)
              .single();
            otherProfile = profile;
          }

          if (otherProfile) {
            otherUserProfileRef.current = {
              id: otherProfile.id as string,
              username: otherProfile.username as string,
              display_name: otherProfile.display_name as string,
              avatar_url: otherProfile.avatar_url as string | null,
              is_online: otherProfile.is_online as boolean,
              last_seen_at: otherProfile.last_seen_at as string | null,
            };
          }

          // Add to conversations state so chat area can render (but has_messages=false keeps it out of sidebar)
          const newConv: Conversation = {
            id: openConvId,
            other_user: otherProfile ? {
              id: otherProfile.id as string,
              username: otherProfile.username as string,
              display_name: otherProfile.display_name as string,
              avatar_url: otherProfile.avatar_url as string | null,
              is_online: otherProfile.is_online as boolean,
              last_seen_at: otherProfile.last_seen_at as string | null,
            } : null,
            last_message: null,
            unread_count: 0,
            updated_at: new Date().toISOString(),
            has_messages: false,
          };
          setConversations(prev => [newConv, ...prev]);
          setSelectedId(openConvId);
          setShowMobileChat(true);
        }

        // Clean URL so refresh doesn't re-trigger
        window.history.replaceState({}, '', '/messages');
      }

      setLoading(false);
    }

    loadConversations();

    const convChannel = supabase
      .channel('conversations-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as { id: string; conversation_id: string; content: string; sender_id: string; created_at: string; message_type?: string };
        const rawPreview = msg.message_type === 'image' ? 'Photo' : msg.message_type === 'voice' ? '🎤 Voice message' : msg.message_type === 'mixed' ? `Photo · ${msg.content}` : msg.content;
        const isMine = msg.sender_id === currentUserIdRef.current;
        const preview = isMine ? `You: ${rawPreview}` : rawPreview;

        // Try to update existing conversation first
        let found = false;
        setConversations(prev => {
          found = prev.some(c => c.id === msg.conversation_id);
          if (!found) return prev;
          return prev.map(c => {
            if (c.id === msg.conversation_id) {
              return {
                ...c,
                last_message: preview,
                updated_at: msg.created_at,
                has_messages: true,
                unread_count: msg.sender_id !== currentUserIdRef.current ? (c.unread_count || 0) + 1 : 0,
              };
            }
            return c;
          }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        });

        // If conversation not in list and message is from another user, fetch and add it
        if (!found && msg.sender_id !== currentUserIdRef.current) {
          const { data: convData } = await supabase.from('conversations').select('id, created_at, updated_at').eq('id', msg.conversation_id).single();
          if (convData) {
            const { data: profile } = await supabase.from('profiles').select('id, username, display_name, avatar_url, is_online, last_seen_at').eq('id', msg.sender_id).single();
            const newConv: Conversation = {
              id: convData.id,
              updated_at: convData.updated_at || convData.created_at,
              last_message: preview,
              unread_count: 1,
              has_messages: true,
              other_user: profile || null,
            };
            setConversations(prev => [newConv, ...prev].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        // Handle unsend: update conversation preview when message content changes
        const updated = payload.new as { id: string; conversation_id: string; content: string; message_type: string };
        setConversations(prev => prev.map(c => {
          if (c.id !== updated.conversation_id) return c;
          const isDeleted = updated.content === 'This message was deleted';
          const preview = isDeleted ? '🚫 Message deleted' : updated.message_type === 'image' ? 'Photo' : updated.message_type === 'voice' ? '🎤 Voice message' : updated.content;
          return { ...c, last_message: preview };
        }));
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(convChannel); };
  }, []);

  // Search messages across conversations
  useEffect(() => {
    if (!currentUserId || searchQuery.trim().length < 2) {
      setSearchResults(new Map());
      setSearchingMessages(false);
      return;
    }

    setSearchingMessages(true);
    const timeout = setTimeout(async () => {
      const q = searchQuery.trim();
      const { data: matches } = await supabase
        .from('messages')
        .select('conversation_id, content')
        .ilike('content', `%${q}%`)
        .is('deleted_at', null)
        .limit(50);

      if (!matches) {
        setSearchResults(new Map());
        setSearchingMessages(false);
        return;
      }

      const snippetMap = new Map<string, string>();
      for (const m of matches) {
        if (!snippetMap.has(m.conversation_id)) {
          const idx = m.content.toLowerCase().indexOf(q.toLowerCase());
          const start = Math.max(0, idx - 20);
          const end = Math.min(m.content.length, idx + q.length + 20);
          const snippet = (start > 0 ? '...' : '') + m.content.slice(start, end) + (end < m.content.length ? '...' : '');
          snippetMap.set(m.conversation_id, snippet);
        }
      }
      setSearchResults(snippetMap);
      setSearchingMessages(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [currentUserId, searchQuery]);

  // H15: Load more conversations pagination
  const loadMoreConversations = useCallback(async () => {
    if (loadingMoreConversations || !hasMoreConversations) return;
    setLoadingMoreConversations(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingMoreConversations(false); return; }

    const offset = conversations.length;
    const { data, error } = await supabase.rpc('get_conversations_with_profiles', { p_user_id: user.id });

    if (error || !data) {
      setHasMoreConversations(false);
      setLoadingMoreConversations(false);
      return;
    }

    const rows = data as Array<{
      conversation_id: string; unread_count: number; updated_at: string;
      other_user_id: string | null; other_username: string | null; other_display_name: string | null;
      other_avatar_url: string | null; other_is_online: boolean | null; other_last_seen_at: string | null;
      last_message_content: string | null; last_message_type: string | null;
      last_message_created_at: string | null; last_message_sender_id: string | null;
    }>;

    // Skip already loaded, take next page
    const existingIds = new Set(conversations.map(c => c.id));
    const fresh = rows.filter(r => !existingIds.has(r.conversation_id) && r.last_message_content !== null);
    const paged = fresh.slice(0, 20);

    setHasMoreConversations(fresh.length > 20);

    const newConversations: Conversation[] = paged.map(r => {
      const isLastMine = r.last_message_sender_id === user.id;
      const preview = r.last_message_type === 'image' ? '📷 Photo'
        : r.last_message_type === 'voice' ? '🎤 Voice message'
        : r.last_message_type === 'mixed' ? `📷 Photo · ${r.last_message_content}`
        : (r.last_message_content || '');
      return {
        id: r.conversation_id,
        other_user: r.other_user_id ? {
          id: r.other_user_id, username: r.other_username || '',
          display_name: r.other_display_name || 'User', avatar_url: r.other_avatar_url,
          is_online: r.other_is_online || false, last_seen_at: r.other_last_seen_at,
        } : null,
        last_message: isLastMine ? `You: ${preview}` : preview,
        unread_count: r.unread_count || 0,
        updated_at: r.last_message_created_at || r.updated_at,
        has_messages: true,
      };
    });

    setConversations(prev => [...prev, ...newConversations]);
    setLoadingMoreConversations(false);
  }, [conversations, loadingMoreConversations, hasMoreConversations]);

  // Handle conversation selection
  const handleSelectConversation = useCallback((conv: Conversation) => {
    if (conv.other_user) otherUserProfileRef.current = conv.other_user;
    setSelectedId(conv.id);
    setShowMobileChat(true);
    setMessages([]);
  }, []);

  // Load messages when selectedId changes
  useEffect(() => {
    if (!selectedId || !currentUserId || !currentUserProfile) return;

    let cancelled = false;

    async function loadMessagesAndSubscribe() {
      sentTempIdsRef.current.clear();
      setMessages([]);
      setHasMoreMessages(true);
      setLoadingMessages(true);

      if (messageChannelRef.current) { supabase.removeChannel(messageChannelRef.current); messageChannelRef.current = null; }
      if (typingChannelRef.current) { supabase.removeChannel(typingChannelRef.current); typingChannelRef.current = null; }
      if (reactionsChannelRef.current) { supabase.removeChannel(reactionsChannelRef.current); reactionsChannelRef.current = null; }

      const result = await getMessages(selectedId as string);

      // Surface errors to console for debugging
      if (result.error) {
        console.error('[MESSAGES] Failed to load messages:', result.error);
      }

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
      // Mark all unseen/undelivered messages from others as delivered + seen
      await markMessagesAsDelivered(selectedId as string);
      await markMessagesAsSeen(selectedId as string);
      // Optimistically mark all incoming messages as seen in local state
      setMessages(prev => prev.map(m => !m.isMine && !m.seen_at ? { ...m, seen_at: new Date().toISOString() } : m));
      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, unread_count: 0 } : c));

      const messageChannel = supabase
        .channel(`messages-${selectedId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` }, async (payload) => {
          // Handle UPDATE events for read receipts + unsend/content changes
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as { id: string; content?: string; message_type?: string; media_url?: string | null; thumbnail_url?: string | null; delivered_at?: string; seen_at?: string };
            setMessages(prev => prev.map(m => {
              if (m.id !== updated.id) return m;
              const next = { ...m };
              if (updated.delivered_at && !m.delivered_at) next.delivered_at = updated.delivered_at;
              if (updated.seen_at && !m.seen_at) next.seen_at = updated.seen_at;
              // Handle unsend: content/message_type/media changed
              if (updated.content !== undefined) next.content = updated.content;
              if (updated.message_type !== undefined) next.message_type = updated.message_type;
              if ('media_url' in updated && updated.media_url === null) {
                next.media_url = null;
                next.media_path = null;
                next.thumbnail_url = null;
                next.thumbnail_path = null;
              }
              return next;
            }));
            return;
          }
          if (payload.eventType !== 'INSERT') return;
          if (cancelled) return;
          const newMsg = payload.new as { id: string; content: string; sender_id: string; created_at: string; message_type?: string; media_url?: string; thumbnail_url?: string; mime_type?: string; file_size?: number; media_width?: number; media_height?: number; duration?: number };
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

          // Resolve signed URLs for media
          const mediaPath = newMsg.media_url || null;
          const thumbPath = newMsg.thumbnail_url || null;
          const [resolvedMediaUrl, resolvedThumbUrl] = await Promise.all([
            mediaPath ? getOrRefreshSignedUrl(mediaPath) : Promise.resolve(null),
            thumbPath ? getOrRefreshSignedUrl(thumbPath) : Promise.resolve(null),
          ]);

          const formattedMessage: Message = {
            id: newMsg.id,
            content: newMsg.content,
            senderId: newMsg.sender_id,
            createdAt: newMsg.created_at,
            isMine: newMsg.sender_id === currentUserIdRef.current,
            sender: senderProfile,
            message_type: newMsg.message_type || 'text',
            media_path: mediaPath,
            media_url: resolvedMediaUrl,
            thumbnail_path: thumbPath,
            thumbnail_url: resolvedThumbUrl,
            mime_type: newMsg.mime_type || null,
            file_size: newMsg.file_size || null,
            media_width: newMsg.media_width || null,
            media_height: newMsg.media_height || null,
            duration: newMsg.duration || null,
            reactions: {},
            my_reaction: null,
          };
          setMessages(prev => deduplicateMessages([...prev, formattedMessage]));

          if (newMsg.sender_id !== currentUserIdRef.current) {
            await markConversationAsRead(selectedIdRef.current!);
            // Mark this message as delivered immediately
            await markMessagesAsDelivered(selectedIdRef.current!);
            // Mark as seen since conversation is open
            await markMessagesAsSeen(selectedIdRef.current!);
            setMessages(prev => prev.map(m => !m.isMine && !m.seen_at ? { ...m, seen_at: new Date().toISOString() } : m));
            setConversations(prev => prev.map(c => c.id === selectedIdRef.current ? { ...c, unread_count: 0 } : c));
          }
        })
        .subscribe();

      messageChannelRef.current = messageChannel;

      const typingChannel = supabase
        .channel(`typing-${selectedId}`)
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return;
          const state = typingChannel.presenceState();
          const typing = new Set<string>();
          Object.values(state).forEach((users: unknown) => {
            (users as Array<{ user_id: string; display_name: string }>).forEach((u) => {
              if (u.user_id !== currentUserIdRef.current) typing.add(u.user_id);
            });
          });
          setTypingUsers(typing);
        })
        .subscribe(async (status) => {
          if (cancelled || status !== 'SUBSCRIBED') return;
          await typingChannel.track({ user_id: currentUserIdRef.current, display_name: 'Me' });
        });

      typingChannelRef.current = typingChannel;

      // Reactions realtime subscription
      const reactionsChannel = supabase
        .channel(`reactions-${selectedId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
          if (cancelled) return;
          const event = payload.eventType;
          const data = payload.new as { message_id: string; user_id: string; emoji: string } | null;
          const oldData = payload.old as { message_id: string; user_id: string; emoji: string } | null;

          // Guard: only process reactions for messages in current conversation
          const targetId = (data?.message_id || oldData?.message_id);
          if (!targetId || !messagesRef.current.some(m => m.id === targetId)) return;

          if (event === 'INSERT' && data) {
            setMessages(prev => prev.map(m => {
              if (m.id !== data.message_id) return m;
              const reactions = { ...m.reactions };
              if (!reactions[data.emoji]) reactions[data.emoji] = { count: 0, userIds: [] };
              if (!reactions[data.emoji].userIds.includes(data.user_id)) {
                reactions[data.emoji] = { count: reactions[data.emoji].count + 1, userIds: [...reactions[data.emoji].userIds, data.user_id] };
              }
              const myReaction = data.user_id === currentUserIdRef.current ? data.emoji : m.my_reaction;
              return { ...m, reactions, my_reaction: myReaction };
            }));
          } else if (event === 'UPDATE' && data && oldData) {
            // Reaction swap (e.g., changing emoji)
            setMessages(prev => prev.map(m => {
              if (m.id !== data.message_id) return m;
              const reactions = { ...m.reactions };
              // Remove old emoji
              if (oldData.emoji && reactions[oldData.emoji]) {
                reactions[oldData.emoji] = {
                  count: Math.max(0, reactions[oldData.emoji].count - 1),
                  userIds: reactions[oldData.emoji].userIds.filter(id => id !== oldData.user_id),
                };
                if (reactions[oldData.emoji].count <= 0) delete reactions[oldData.emoji];
              }
              // Add new emoji
              if (data.emoji) {
                if (!reactions[data.emoji]) reactions[data.emoji] = { count: 0, userIds: [] };
                if (!reactions[data.emoji].userIds.includes(data.user_id)) {
                  reactions[data.emoji] = { count: reactions[data.emoji].count + 1, userIds: [...reactions[data.emoji].userIds, data.user_id] };
                }
              }
              const myReaction = data.user_id === currentUserIdRef.current ? data.emoji : m.my_reaction;
              return { ...m, reactions, my_reaction: myReaction };
            }));
          } else if (event === 'DELETE' && oldData) {
            setMessages(prev => prev.map(m => {
              if (m.id !== oldData.message_id) return m;
              const reactions = { ...m.reactions };
              if (reactions[oldData.emoji]) {
                reactions[oldData.emoji] = {
                  count: Math.max(0, reactions[oldData.emoji].count - 1),
                  userIds: reactions[oldData.emoji].userIds.filter(id => id !== oldData.user_id),
                };
                if (reactions[oldData.emoji].count <= 0) delete reactions[oldData.emoji];
              }
              const myReaction = oldData.user_id === currentUserIdRef.current ? null : m.my_reaction;
              return { ...m, reactions, my_reaction: myReaction };
            }));
          }
        })
        .subscribe();

      reactionsChannelRef.current = reactionsChannel;
    }

    loadMessagesAndSubscribe();

    return () => {
      cancelled = true;
      if (messageChannelRef.current) { supabase.removeChannel(messageChannelRef.current); messageChannelRef.current = null; }
      if (typingChannelRef.current) { supabase.removeChannel(typingChannelRef.current); typingChannelRef.current = null; }
      if (reactionsChannelRef.current) { supabase.removeChannel(reactionsChannelRef.current); reactionsChannelRef.current = null; }
      // Clean up typing timeout
      if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
      if (typingDebounceRef.current) { clearTimeout(typingDebounceRef.current); typingDebounceRef.current = null; }
    };
  }, [selectedId, currentUserId, currentUserProfile, deduplicateMessages]);

  // H10: Smart auto-scroll — only scroll if user is already near the bottom
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 150;
      isNearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [selectedId]);

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Count new messages that arrived while scrolled up (only from others)
      const newMessages = messages.slice(-1); // just the latest
      const hasNewFromOthers = newMessages.some(m => !m.isMine);
      if (hasNewFromOthers) {
        unreadCountRef.current += 1;
        setUnreadCount(unreadCountRef.current);
      }
    }
  }, [messages.length]);

  // Track typing with debounce
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const handleTyping = useCallback(async () => {
    const sid = selectedIdRef.current;
    const uid = currentUserIdRef.current;
    const tc = typingChannelRef.current;
    if (!sid || !uid || !tc) return;

    // Debounce: only fire every 400ms
    if (typingDebounceRef.current) return;
    typingDebounceRef.current = setTimeout(() => {
      typingDebounceRef.current = null;
    }, 400);

    // Send typing event
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      await tc.track({ user_id: uid, display_name: currentUserProfile?.display_name || 'User', typing_at: Date.now() });
    }

    // Auto-stop after 2s inactivity
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      tc?.untrack();
    }, 2000);
  }, [currentUserProfile?.display_name]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateRawFile(file);
    if (error) {
      showToast(error);
      return;
    }

    const contentError = await verifyImageContent(file);
    if (contentError) {
      showToast(contentError);
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

  const getOrRefreshSignedUrl = async (path: string): Promise<string | null> => {
    if (!path) return null;
    // Legacy full URL — return as-is
    if (path.startsWith('http')) return path;

    const cached = signedUrlCacheRef.current.get(path);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.url;
    }

    const result = await getSignedUrl(path);
    if (result.url) {
      signedUrlCacheRef.current.set(path, {
        url: result.url,
        expiresAt: Date.now() + 15 * 60 * 1000,
      });
      return result.url;
    }


    return null;
  };

  const uploadWithProgress = async (
    path: string,
    file: File | Blob,
    contentType: string,
    onProgress: (percent: number) => void
  ): Promise<{ error: string | null }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Not authenticated' };

    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/messages/${path}`;

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('cacheControl', '3600');
      xhr.setRequestHeader('Content-Type', contentType);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ error: null });
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            resolve({ error: body.message || 'Upload failed' });
          } catch {
            resolve({ error: 'Upload failed' });
          }
        }
      };

      xhr.onerror = () => resolve({ error: 'Network error during upload' });
      xhr.send(file);
    });
  };

  const handleRetryMessage = async (tempId: string) => {
    const failedData = failedMessages.get(tempId);
    if (!failedData) return;

    const uid = currentUserIdRef.current;
    const sid = selectedIdRef.current;
    const profile = currentUserProfileRef.current;
    if (!uid || !sid || !profile) return;

    // Mark as sending
    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sending' as const } : m));

    let media: MediaMetadata | undefined;

    // Voice retry: re-upload blob
    if (failedData.blob) {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const ext = failedData.blob.type.includes('webm') ? 'webm' : failedData.blob.type.includes('mp4') ? 'm4a' : 'webm';
      const voicePath = `${uid}/conversations/${sid}/${timestamp}-${random}.${ext}`;

      const uploadResult = await uploadWithProgress(voicePath, failedData.blob, failedData.blob.type, () => {});
      if (uploadResult.error) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' as const } : m));
        return;
      }

      media = {
        path: voicePath,
        mimeType: failedData.blob.type,
        fileSize: failedData.blob.size,
        duration: failedData.duration,
      };

      const signedMedia = await getOrRefreshSignedUrl(voicePath);
      const result = await sendMessage(sid, failedData.content, media, failedData.replyToMessageId, undefined, failedData.duration);
      if (result.success && result.message) {
        setFailedMessages(prev => { const next = new Map(prev); next.delete(tempId); return next; });
        setMessages(prev => prev.map(m => m.id === tempId ? {
          ...m, id: result.message!.id, createdAt: result.message!.created_at, status: 'sent' as const, media_url: signedMedia || m.media_url,
        } : m));
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' as const } : m));
      }
      return;
    }

    if (failedData.file) {
      setUploadProgress(0);
      try {
        const compressed = await compressForMessage(failedData.file);
        const thumbnail = await generateThumbnail(failedData.file);

        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const basePath = `${uid}/conversations/${sid}`;
        const imagePath = `${basePath}/${timestamp}-${random}.webp`;
        const thumbPath = `${basePath}/${timestamp}-${random}-thumb.webp`;

        const imgResult = await uploadWithProgress(imagePath, compressed.file, 'image/webp', setUploadProgress);
        if (imgResult.error) throw new Error(imgResult.error);

        // Upload thumbnail (non-fatal)
        await uploadWithProgress(thumbPath, thumbnail.file, 'image/webp', () => {});

        media = {
          path: imagePath,
          thumbnailPath: thumbPath,
          mimeType: 'image/webp',
          fileSize: compressed.file.size,
          width: compressed.width,
          height: compressed.height,
        };
      } catch (err) {
        setUploadProgress(-1);
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' as const } : m));
        return;
      }
      setUploadProgress(-1);
    }

    const displayContent = failedData.content;
    const result = await sendMessage(sid, displayContent, media, failedData.replyToMessageId);

    if (result.success && result.message) {
      const [signedMedia, signedThumb] = await Promise.all([
        media?.path ? getOrRefreshSignedUrl(media.path) : Promise.resolve(null),
        media?.thumbnailPath ? getOrRefreshSignedUrl(media.thumbnailPath) : Promise.resolve(null),
      ]);
      setMessages(prev => prev.map(m => m.id === tempId ? {
        ...m,
        id: result.message!.id,
        createdAt: result.message!.created_at,
        status: 'sent' as const,
        media_url: signedMedia || m.media_url,
        thumbnail_url: signedThumb || m.thumbnail_url,
      } : m));
      setFailedMessages(prev => { const next = new Map(prev); next.delete(tempId); return next; });
    } else {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' as const } : m));
    }
  };

  const handleDeleteFailedMessage = (tempId: string) => {
    // M7: Revoke any blob URLs before removing the failed message
    setMessages(prev => {
      const msg = prev.find(m => m.id === tempId);
      if (msg?.media_url?.startsWith('blob:')) URL.revokeObjectURL(msg.media_url);
      if (msg?.thumbnail_url?.startsWith('blob:')) URL.revokeObjectURL(msg.thumbnail_url);
      return prev.filter(m => m.id !== tempId);
    });
    setFailedMessages(prev => { const next = new Map(prev); next.delete(tempId); return next; });
  };

  // Reaction handler (optimistic)
  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = { ...m.reactions };
      const myReaction = m.my_reaction;

      if (myReaction === emoji) {
        // Remove reaction
        if (reactions[emoji]) {
          reactions[emoji] = { count: reactions[emoji].count - 1, userIds: reactions[emoji].userIds.filter(id => id !== currentUserId) };
          if (reactions[emoji].count <= 0) delete reactions[emoji];
        }
        return { ...m, reactions, my_reaction: null };
      } else {
        // Remove old reaction if exists
        if (myReaction && reactions[myReaction]) {
          reactions[myReaction] = { count: reactions[myReaction].count - 1, userIds: reactions[myReaction].userIds.filter(id => id !== currentUserId) };
          if (reactions[myReaction].count <= 0) delete reactions[myReaction];
        }
        // Add new reaction
        if (!reactions[emoji]) reactions[emoji] = { count: 0, userIds: [] };
        reactions[emoji] = { count: reactions[emoji].count + 1, userIds: [...reactions[emoji].userIds, currentUserId!] };
        return { ...m, reactions, my_reaction: emoji };
      }
    }));

    // Fire server action (non-blocking)
    addReaction(messageId, emoji);
  }, [currentUserId]);

  const handleReply = useCallback((msg: MessageBubbleData) => {
    setReplyTo(msg);
  }, []);

  const handleDelete = useCallback(async (messageId: string, deleteForEveryone: boolean) => {
    const result = await deleteMessage(messageId, deleteForEveryone);
    if (result.error) {
      showToast(result.error);
      return;
    }
    if (result.action === 'deleted_for_me') {
      // M5: Use functional setState to access current messages without closure dependency
      setMessages(prev => {
        const remaining = prev.filter(m => m.id !== messageId);
        // Update conversation preview if this was the latest message
        const convId = selectedIdRef.current;
        if (convId) {
          const last = remaining[remaining.length - 1];
          const preview = last
            ? (last.isMine ? `You: ${last.content || 'Media'}` : (last.content || 'Media'))
            : 'Start a conversation';
          setConversations(convs => convs.map(c => c.id === convId ? { ...c, last_message: preview } : c));
        }
        return remaining;
      });
    } else if (result.action === 'deleted_for_everyone') {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: 'This message was deleted', message_type: 'text', media_url: null, thumbnail_url: null } : m));
      // M5: Update conversation preview
      const convId = selectedIdRef.current;
      if (convId) {
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, last_message: '🚫 Message deleted' } : c));
      }
    }
  }, []);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Silent fail
    }
  }, []);

  const handleReport = useCallback(async (messageId: string) => {
    const reason = prompt('Why are you reporting this message?');
    if (!reason || reason.length < 3) return;
    const result = await reportMessage(messageId, reason);
    showToast(
      result.success ? 'Report submitted' : (result.error || 'Failed to report'),
      result.success ? 'success' : 'error'
    );
  }, []);

  const handleBlock = useCallback(async (userId: string) => {
    setBlockUserId(userId);
  }, []);

  const confirmBlock = useCallback(async () => {
    if (!blockUserId) return;
    const result = await blockUser(blockUserId);
    if (result.success) {
      showToast('User blocked', 'success');
      // Remove conversation with blocked user from sidebar
      setConversations(prev => prev.filter(c => c.other_user?.id !== blockUserId));
      // Close mobile chat view
      setShowMobileChat(false);
    } else {
      showToast(result.error || 'Failed to block user');
    }
    setBlockUserId(null);
  }, [blockUserId, showToast]);

  const handleForward = useCallback(async (targetConversationId: string) => {
    if (!forwardMessage) return;
    const content = forwardMessage.content || '';
    const media: MediaMetadata | undefined = forwardMessage.media_path ? {
      path: forwardMessage.media_path,
      mimeType: 'image/webp',
    } : undefined;
    const result = await sendMessage(targetConversationId, content, media);
    if (result.success) {
      showToast('Message forwarded', 'success');
    } else {
      showToast(result.error || 'Failed to forward');
    }
    setForwardMessage(null);
    setForwardSearch('');
  }, [forwardMessage, showToast]);

  const handleDeleteConversation = useCallback(async () => {
    if (!deleteConvId) return;
    // Remove participant row (user leaves the conversation)
    const { error } = await supabase
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', deleteConvId)
      .eq('user_id', currentUserId);

    if (!error) {
      setConversations(prev => prev.filter(c => c.id !== deleteConvId));
      if (selectedId === deleteConvId) {
        setSelectedId(null);
        setShowMobileChat(false);
      }
      showToast('Conversation deleted', 'success');
    } else {
      showToast('Failed to delete conversation');
    }
    setDeleteConvId(null);
  }, [deleteConvId, currentUserId, selectedId, showToast]);

  const handleSaveMedia = useCallback(async (mediaUrl: string, messageType: string, mediaPath?: string) => {
    try {
      let url = mediaUrl;
      // Refresh signed URL if we have the path
      if (mediaPath) {
        const fresh = await getOrRefreshSignedUrl(mediaPath);
        if (fresh) url = fresh;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = url.split('/').pop()?.split('?')[0] || 'media';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      showToast('Failed to save media');
    }
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = selectedIdRef.current;
    const uid = currentUserIdRef.current;
    const profile = currentUserProfileRef.current;
    const tid = sentTempIdsRef.current;

    if ((!newMessage.trim() && !imageFile) || !sid || sending || !uid || !profile) return;

    // Haptic feedback on send
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }

    setSending(true);
    let media: MediaMetadata | undefined;

    // Compress and upload image if present
    if (imageFile) {
      setUploadProgress(0);
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

        // Upload optimized image with progress
        const imgResult = await uploadWithProgress(imagePath, compressed.file, 'image/webp', setUploadProgress);

        if (imgResult.error) {
          showToast(imgResult.error);
          setUploadProgress(-1);
          setSending(false);
          return;
        }

        // Upload thumbnail (non-fatal)
        const thumbResult = await uploadWithProgress(thumbPath, thumbnail.file, 'image/webp', () => {});

        media = {
          path: imagePath,
          thumbnailPath: thumbResult.error ? imagePath : thumbPath,
          mimeType: 'image/webp',
          fileSize: compressed.file.size,
          width: compressed.width,
          height: compressed.height,
        };
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to process image.');
        setUploadProgress(-1);
        setSending(false);
        return;
      }
      setUploadProgress(-1);
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    tid.add(tempId);

    const displayContent = newMessage.trim() || (media ? 'Photo' : '');
    const messageType = media ? (newMessage.trim() ? 'mixed' : 'image') : 'text';

    // For temp message display, use blob URL from the file
    const tempMediaUrl = imageFile ? URL.createObjectURL(imageFile) : null;

    const tempMessage: Message = {
      id: tempId,
      content: displayContent,
      senderId: uid,
      createdAt: new Date().toISOString(),
      isMine: true,
      sender: profile,
      message_type: messageType,
      media_path: media?.path || null,
      media_url: tempMediaUrl,
      thumbnail_path: media?.thumbnailPath || null,
      thumbnail_url: tempMediaUrl,
      mime_type: media?.mimeType || null,
      file_size: media?.fileSize || null,
      media_width: media?.width || null,
      media_height: media?.height || null,
      reactions: {},
      my_reaction: null,
      status: 'sending',
      file: imageFile ?? undefined,
    };
    setMessages(prev => deduplicateMessages([...prev, tempMessage]));
    clearImagePreview();
    setNewMessage('');
    // Reset textarea height after clearing
    if (messageInputRef.current) {
      messageInputRef.current.style.height = 'auto';
    }
    // Haptic feedback on send
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }

    const result = await sendMessage(sid, displayContent, media, replyTo?.id);
    setReplyTo(null);

    if (result.success && result.message) {
      tid.delete(tempId);
      // Mark conversation as having messages (so it appears in sidebar)
      setConversations(prev => prev.map(c => c.id === sid ? { ...c, has_messages: true, last_message: `You: ${displayContent}`, updated_at: result.message!.created_at } : c));
      // Resolve signed URLs for the confirmed message
      const [signedMedia, signedThumb] = await Promise.all([
        media?.path ? getOrRefreshSignedUrl(media.path) : Promise.resolve(null),
        media?.thumbnailPath ? getOrRefreshSignedUrl(media.thumbnailPath) : Promise.resolve(null),
      ]);
      // Revoke blob URLs after replacing with signed URLs
      if (tempMediaUrl) URL.revokeObjectURL(tempMediaUrl);
      setMessages(prev => deduplicateMessages(prev.map(m => m.id === tempId ? {
        ...m,
        id: result.message!.id,
        createdAt: result.message!.created_at,
        status: 'sent' as const,
        media_url: signedMedia || m.media_url,
        thumbnail_url: signedThumb || m.thumbnail_url,
        delivered_at: (result.message as Record<string, unknown>).delivered_at as string | null || null,
        seen_at: (result.message as Record<string, unknown>).seen_at as string | null || null,
      } : m)));
    } else {
      tid.delete(tempId);
      // H11: Revoke blob URL on send failure to prevent memory leak
      if (tempMediaUrl) URL.revokeObjectURL(tempMediaUrl);
      // Mark as failed instead of removing — user can retry
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' as const, media_url: null, thumbnail_url: null } : m));
      setFailedMessages(prev => new Map(prev).set(tempId, { content: displayContent, media, file: imageFile ?? undefined, replyToMessageId: replyTo?.id }));
    }
    setSending(false);
    // Re-focus input after sending (desktop only — mobile keyboard would flicker)
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setTimeout(() => messageInputRef.current?.focus(), 50);
    }
  };

  const handleVoiceSend = useCallback(async (blob: Blob, duration: number) => {
    const sid = selectedIdRef.current;
    const uid = currentUserIdRef.current;
    const profile = currentUserProfileRef.current;
    const tid = sentTempIdsRef.current;

    if (!sid || !uid || !profile || blob.size < 100) {
      setIsRecordingVoice(false);
      return;
    }

    setIsRecordingVoice(false);
    setSending(true);

    // Upload voice blob
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const voicePath = `${uid}/conversations/${sid}/${timestamp}-${random}.${ext}`;

    const uploadResult = await uploadWithProgress(voicePath, blob, blob.type, () => {});
    if (uploadResult.error) {
      showToast(uploadResult.error);
      setSending(false);
      return;
    }

    const media: MediaMetadata = {
      path: voicePath,
      mimeType: blob.type,
      fileSize: blob.size,
      duration,
    };

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    tid.add(tempId);

    const tempMessage: Message = {
      id: tempId,
      content: '',
      senderId: uid,
      createdAt: new Date().toISOString(),
      isMine: true,
      sender: profile,
      message_type: 'voice',
      media_path: voicePath,
      media_url: URL.createObjectURL(blob),
      duration,
      reactions: {},
      my_reaction: null,
      status: 'sending',
    };
    const voiceBlobUrl = tempMessage.media_url!;
    setMessages(prev => deduplicateMessages([...prev, tempMessage]));

    const result = await sendMessage(sid, '', media, undefined, undefined, duration);

    if (result.success && result.message) {
      tid.delete(tempId);
      setConversations(prev => prev.map(c => c.id === sid ? { ...c, has_messages: true, last_message: '🎤 Voice message', updated_at: result.message!.created_at } : c));
      const signedMedia = await getOrRefreshSignedUrl(voicePath);
      URL.revokeObjectURL(voiceBlobUrl);
      setMessages(prev => deduplicateMessages(prev.map(m => m.id === tempId ? {
        ...m,
        id: result.message!.id,
        createdAt: result.message!.created_at,
        status: 'sent' as const,
        media_url: signedMedia || m.media_url,
        delivered_at: (result.message as Record<string, unknown>).delivered_at as string | null || null,
      } : m)));
    } else {
      tid.delete(tempId);
      // H12: Revoke voice blob URL on send failure to prevent memory leak
      URL.revokeObjectURL(voiceBlobUrl);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' as const, media_url: null } : m));
      setFailedMessages(prev => new Map(prev).set(tempId, { content: '', blob, duration }));
    }
    setSending(false);
  }, [uploadWithProgress, showToast, deduplicateMessages]);

  // H17: Format date for day separators
  // H16: Load older messages for pagination
  const loadMoreMessages = useCallback(async () => {
    const sid = selectedIdRef.current;
    if (!sid || loadingOlderMessages || !hasMoreMessages || messages.length === 0) return;
    setLoadingOlderMessages(true);

    const oldest = messages[0];
    if (!oldest) { setLoadingOlderMessages(false); return; }

    const result = await getOlderMessages(sid, oldest.createdAt);
    if (result.messages.length === 0) {
      setHasMoreMessages(false);
    } else {
      if (result.messages.length < 50) setHasMoreMessages(false);
      setMessages(prev => [...result.messages, ...prev]);
    }
    setLoadingOlderMessages(false);
  }, [messages, loadingOlderMessages, hasMoreMessages]);

  const formatDateSeparator = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const selectedConversation = conversations.find(c => c.id === selectedId);
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return (
    <MainLayout>
      {/* Expose unread count for sidebar/mobile nav to read */}
      <div id="messages-unread-count" data-count={totalUnread} className="hidden" />

      {/* H41: Use svh (small viewport) to prevent keyboard resize scroll jumps on mobile */}
      {/* Mobile: nav (64px) + safe-area-inset-bottom + header spacing. Desktop: just header spacing */}
      <div className="flex overflow-x-hidden h-[calc(100svh-4rem-env(safe-area-inset-bottom,0px))] lg:h-[calc(100vh-57px)]">
        {/* Conversations List */}
        <div className={cn(
          "w-full md:w-80 border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-primary)]",
          showMobileChat && 'hidden md:flex'
        )}>
          <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
            <h1 className="heading-page">Messages</h1>
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-[7px] rounded-xl bg-[var(--bg-tertiary)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            </div>
          </div>
          <div role="list" aria-label="Conversations" className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div role="status" className="relative p-3">
                <div className="blur-[2px] opacity-60">
                  <ListSkeleton items={6} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            ) : conversations.length > 0 ? (
              (() => {
                const filteredConvs = conversations
                  .filter(conv => {
                    if (!conv.has_messages) return false;
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    if (conv.other_user?.display_name?.toLowerCase().includes(q) || conv.other_user?.username?.toLowerCase().includes(q)) return true;
                    return searchResults.has(conv.id);
                  });
                if (filteredConvs.length === 0 && searchQuery.trim()) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <div className="w-14 h-14 rounded-full bg-[var(--bg-tertiary)] mb-3 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                        </svg>
                      </div>
                      <p className="font-semibold text-[var(--text-primary)] text-[15px]">No results for "{searchQuery}"</p>
                      <p className="text-sm text-[var(--text-muted)] mt-0.5">Try a different search term</p>
                    </div>
                  );
                }
                return filteredConvs.map((conv) => {
                  const isUnread = conv.unread_count > 0;
                  const isSelected = selectedId === conv.id;
                  return (
                    <button
                      key={conv.id}
                      role="listitem"
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => handleSelectConversation(conv)}
                      onContextMenu={(e) => { e.preventDefault(); setDeleteConvId(conv.id); }}
                      onTouchStart={(e) => {
                        const touch = e.touches[0];
                        (e.currentTarget as HTMLButtonElement & { _lt?: ReturnType<typeof setTimeout> })._lt = setTimeout(() => {
                          setDeleteConvId(conv.id);
                        }, 500);
                      }}
                      onTouchEnd={(e) => { clearTimeout((e.currentTarget as HTMLButtonElement & { _lt?: ReturnType<typeof setTimeout> })._lt); }}
                      onTouchCancel={(e) => { clearTimeout((e.currentTarget as HTMLButtonElement & { _lt?: ReturnType<typeof setTimeout> })._lt); }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 transition-colors-fast text-left',
                        isSelected ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'
                      )}
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar
                          src={conv.other_user?.avatar_url || null}
                          name={conv.other_user?.display_name || 'User'}
                          size="lg"
                          showOnline={isOnline(conv.other_user?.id || '')}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn(
                            'text-[15px] truncate',
                            isUnread ? 'font-bold text-[var(--text-primary)]' : 'font-normal text-[var(--text-primary)]'
                          )}>
                            {conv.other_user?.display_name || 'User'}
                          </p>
                          <span className={cn(
                            'text-xs flex-shrink-0',
                            isUnread ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-muted)]'
                          )}>
                            {formatTime(conv.updated_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          {typingUsers.has(conv.other_user?.id || '') ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center gap-0.5">
                                <div className="typing-dot" />
                                <div className="typing-dot" />
                                <div className="typing-dot" />
                              </div>
                              <span className="text-[13px] text-[var(--accent-primary)] font-medium">typing…</span>
                            </div>
                          ) : (
                          <p className={cn(
                            'text-[13px] truncate leading-tight',
                            isUnread ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-muted)]'
                          )}>
                            {searchResults.has(conv.id) ? searchResults.get(conv.id) : conv.last_message}
                          </p>
                          )}
                          {isUnread && (
                            <span className="flex-shrink-0 min-w-[22px] h-[22px] px-1 rounded-full bg-[var(--accent-primary)] text-white text-[11px] font-bold flex items-center justify-center">
                              {conv.unread_count > 99 ? '99+' : conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                });
              })()
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-14 h-14 rounded-full bg-[var(--bg-tertiary)] mb-3 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="font-semibold text-[var(--text-primary)] text-[15px]">
                  {loadError ? 'Failed to load conversations' : 'No conversations yet'}
                </p>
                <p className="text-sm text-[var(--text-muted)] mt-0.5 mb-3">
                  {loadError || 'Start a conversation with someone'}
                </p>
                {loadError ? (
                  <button
                    onClick={() => { setLoadError(null); window.location.reload(); }}
                    className="text-sm font-semibold text-[var(--accent-primary)]"
                  >
                    Retry
                  </button>
                ) : (
                  <Link href="/explore" className="text-sm font-semibold text-[var(--accent-primary)]">Find people</Link>
                )}
              </div>
            )}
            {/* H15: Load more conversations */}
            {hasMoreConversations && (
              <button
                onClick={loadMoreConversations}
                disabled={loadingMoreConversations}
                className="w-full py-3 text-sm text-[var(--accent-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                {loadingMoreConversations ? 'Loading...' : 'Load older conversations'}
              </button>
            )}
          </div>

          {/* New chat button */}
          <div className="p-3 border-t border-[var(--border-subtle)]">
            <Link
              href="/explore"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold active:opacity-80 transition-opacity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              New message
            </Link>
          </div>
        </div>

        {/* Chat Area */}
        <div className={cn(
          'relative flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)]',
          !showMobileChat && 'hidden md:flex'
        )}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-3 bg-[var(--bg-primary)]">
                <button
                  onClick={() => setShowMobileChat(false)}
                  aria-label="Back to conversations"
                  className="md:hidden p-2 -ml-2 min-w-[44px] min-h-[44px] hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-tertiary)] rounded-full transition-colors-fast flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <Avatar
                  src={selectedConversation.other_user?.avatar_url || null}
                  name={selectedConversation.other_user?.display_name || 'User'}
                  size="md"
                  showOnline={isOnline(selectedConversation.other_user?.id || '')}
                />
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${selectedConversation.other_user?.username}`} className="font-semibold text-[var(--text-primary)] text-[15px] leading-tight block truncate">
                    {selectedConversation.other_user?.display_name || 'User'}
                  </Link>
                  {typingUsers.size > 0 ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex items-center gap-0.5">
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                      </div>
                      <span className="text-xs text-[var(--accent-primary)] font-medium">typing…</span>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {formatLastSeen(
                        selectedConversation.other_user?.last_seen_at || null,
                        isOnline(selectedConversation.other_user?.id || '')
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div role="log" aria-label="Messages" aria-live="polite" ref={scrollContainerRef} className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-3 md:px-4 py-3"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  // Load older messages when near top
                  if (el.scrollTop < 50 && hasMoreMessages && !loadingOlderMessages) {
                    loadMoreMessages();
                  }
                  // Show scroll-to-bottom button when scrolled up
                  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                  const isNearBottom = distFromBottom < 150;
                  setShowScrollDown(distFromBottom > 200);
                  // Reset unread count when near bottom
                  if (isNearBottom) {
                    unreadCountRef.current = 0;
                    setUnreadCount(0);
                  }
                }}
              >
                {loadingMessages ? (
                  <div role="status" className="relative py-2 space-y-3">
                    <div className="blur-[2px] opacity-60">
                      {[40, 60, 50, 55, 35, 50].map((w, i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                          <div className="flex items-end gap-2 max-w-[78%] md:max-w-[min(65%,520px)]">
                            {i % 2 === 0 && <Skeleton variant="circular" width={32} height={32} className="flex-shrink-0" />}
                            <Skeleton className="rounded-2xl" width={`${w}%`} height={36} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  </div>
                ) : messages.length > 0 ? (
                  <div className="py-2">
                    {/* H16: Loading indicator at top when fetching older messages */}
                    {loadingOlderMessages && (
                      <div className="flex items-center justify-center py-2">
                        <div className="w-5 h-5 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {!hasMoreMessages && !loadingOlderMessages && messages.length >= 200 && (
                      <div className="text-center text-[11px] text-[var(--text-muted)] py-2">Start of conversation</div>
                    )}
                    {(() => {
                      // Compute read receipt targets once
                      const myMsgs = messages.filter(m => m.isMine && m.status !== 'failed' && m.status !== 'sending');
                      const newestOutgoingId = myMsgs.length > 0 ? myMsgs[myMsgs.length - 1].id : null;
                      const latestSeenId = [...myMsgs].reverse().find(m => m.seen_at)?.id || null;

                      // Find the first unread message index for the unread separator
                      const lastReadMsgId = selectedConversation.last_read_message_id;
                      const firstUnreadIdx = lastReadMsgId
                        ? messages.findIndex(m => !m.isMine && m.id === lastReadMsgId)
                        : -1;

                      return messages.map((msg, i) => {
                      const prevMsg = i > 0 ? messages[i - 1] : null;
                      const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId;

                      // H17: Insert date separator when day changes
                      const showDateSeparator = !prevMsg ||
                        new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

                      // Show unread separator before the first unread incoming message after the last read
                      const showUnreadSeparator = firstUnreadIdx >= 0 && i === firstUnreadIdx + 1 && !msg.isMine;

                      // Failed/sending messages — render with MessageBubble for full interaction support
                      if (msg.status === 'failed' || msg.status === 'sending') {
                        return (
                          <div key={msg.id}>
                            {showDateSeparator && (
                              <div className="flex items-center justify-center my-4">
                                <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-secondary)] px-3 py-1 rounded-full">
                                  {new Date(msg.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            )}
                            {showUnreadSeparator && (
                              <div className="flex items-center gap-3 my-4 px-4">
                                <div className="flex-1 h-px bg-[var(--destructive)]/40" />
                                <span className="text-[11px] text-[var(--destructive)] font-medium">New messages</span>
                                <div className="flex-1 h-px bg-[var(--destructive)]/40" />
                              </div>
                            )}
                            <div className={cn('flex w-full mt-2', msg.isMine ? 'justify-end' : 'justify-start')}>
                              <div className={cn('max-w-[80%] md:max-w-[min(65%,480px)] min-w-0')}>
                                <div className={cn(
                                  'text-sm rounded-2xl px-3.5 py-2 min-w-0',
                                  msg.isMine ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-br-md' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-bl-md',
                                  msg.status === 'failed' && 'opacity-60'
                                )}>
                                  {msg.content && msg.content !== 'Photo' && <p className="message-text text-sm">{msg.content}</p>}
                                  {msg.media_url && (
                                    <div className="mt-1">
                                      <img src={msg.media_url} alt="" className="rounded-lg max-w-full max-h-[300px] object-contain" />
                                    </div>
                                  )}
                                </div>
                                {msg.status === 'failed' && msg.isMine && (
                                  <div className="flex items-center gap-2 mt-1.5 px-1">
                                    <div className="flex items-center gap-1.5">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--destructive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
                                      </svg>
                                      <span className="text-[11px] text-[var(--destructive)] font-medium">Failed to send</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRetryMessage(msg.id)}
                                      className="text-[11px] text-[var(--accent-primary)] font-semibold active:opacity-60 transition-opacity px-2 py-0.5 rounded-md bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)]/20"
                                    >
                                      Retry
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFailedMessage(msg.id)}
                                      className="text-[11px] text-[var(--text-muted)] active:opacity-60 transition-opacity px-2 py-0.5 rounded-md hover:bg-[var(--bg-tertiary)]"
                                    >
                                      Dismiss
                                    </button>
                                  </div>
                                )}
                                {msg.status === 'sending' && msg.isMine && (
                                  <div className="flex items-center gap-1.5 mt-1 px-1">
                                    <div className="animate-spin w-3 h-3 border-2 border-[var(--text-muted)] border-t-transparent rounded-full" />
                                    <span className="text-[10px] text-[var(--text-muted)]">Sending...</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id}>
                          {showDateSeparator && (
                            <div className="flex items-center justify-center my-4">
                              <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-secondary)] px-3 py-1 rounded-full">
                                {formatDateSeparator(msg.createdAt)}
                              </span>
                            </div>
                          )}
                          {showUnreadSeparator && (
                            <div className="flex items-center gap-3 my-4 px-4">
                              <div className="flex-1 h-px bg-[var(--destructive)]/40" />
                              <span className="text-[11px] text-[var(--destructive)] font-medium">New messages</span>
                              <div className="flex-1 h-px bg-[var(--destructive)]/40" />
                            </div>
                          )}
                          <div className={cn('px-0', isConsecutive && !showDateSeparator ? 'mt-[3px]' : 'mt-3')}>
                            <MessageBubble
                              message={msg as MessageBubbleData}
                              showAvatar={!isConsecutive && !msg.isMine}
                              showTail={(() => {
                                const nextMsg = i < messages.length - 1 ? messages[i + 1] : null;
                                return !nextMsg || nextMsg.senderId !== msg.senderId;
                              })()}
                              onReact={handleReact}
                              onReply={handleReply}
                              onDelete={handleDelete}
                              onCopy={handleCopy}
                              onReport={handleReport}
                              onBlock={handleBlock}
                              onSaveMedia={handleSaveMedia}
                              onForward={(m) => { setForwardMessage(m); setForwardSearch(''); }}
                              onImageClick={(url) => {
                                const imgMsg = messages.find(m => m.media_url === url || m.thumbnail_url === url);
                                setEnlargedImage({ url, mediaPath: imgMsg?.media_path || undefined });
                              }}
                              onRefreshUrl={getOrRefreshSignedUrl}
                            />
                          </div>
                        </div>
                      );
                    });
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center max-w-xs px-4">
                      <Avatar
                        src={selectedConversation.other_user?.avatar_url || null}
                        name={selectedConversation.other_user?.display_name || 'User'}
                        size="xl"
                      />
                      <p className="font-semibold text-[var(--text-primary)] text-lg mt-4">
                        {selectedConversation.other_user?.display_name || 'User'}
                      </p>
                      <p className="text-sm text-[var(--text-muted)] mt-0.5">
                        @{selectedConversation.other_user?.username || 'user'}
                      </p>
                      <p className="text-sm text-[var(--text-muted)] mt-4">
                        No messages yet. Say hello!
                      </p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Typing indicator bubble in chat area */}
              {typingUsers.size > 0 && (
                <div className="flex justify-start px-4 py-1 animate-fadeIn">
                  <div className="flex items-end gap-2 max-w-[78%] md:max-w-[min(62%,480px)] min-w-0">
                    <Avatar
                      src={selectedConversation.other_user?.avatar_url || null}
                      name={selectedConversation.other_user?.display_name || 'User'}
                      size="sm"
                    />
                    <div className="bg-[var(--bg-secondary)] rounded-2xl rounded-bl-md px-4 py-2.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[var(--text-muted)] truncate">
                          {selectedConversation.other_user?.display_name || 'Someone'} is typing
                        </span>
                        <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Scroll to bottom button */}
              {showScrollDown && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
                  <button
                    onClick={() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnreadCount(0); unreadCountRef.current = 0; }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] shadow-lg text-[var(--text-muted)] text-xs font-medium hover:bg-[var(--bg-tertiary)] active:scale-95 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                    {unreadCount > 0 ? (
                      <span className="bg-[var(--accent-primary)] text-[var(--text-inverse)] text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                        {unreadCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              )}

              {/* Message Input */}
              <form onSubmit={handleSend} className="border-t border-[var(--border-subtle)] shrink-0 min-w-0 bg-[var(--bg-primary)] pb-[env(safe-area-inset-bottom,0px)]">
                {/* Reply preview */}
                {/* Removed to hide reply previews for individual messages as requested */}

                {/* Image preview */}
                {imagePreview && (
                  <div className="px-3 pt-3 pb-0 min-w-0">
                    <div className="relative inline-block group">
                      <img src={imagePreview} alt="Preview" className="max-h-[120px] rounded-lg object-cover" />
                      {uploadProgress < 0 && (
                        <button
                          type="button"
                          onClick={clearImagePreview}
                          aria-label="Remove image"
                          className="absolute -top-2.5 -right-2.5 w-8 h-8 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-muted)] flex items-center justify-center text-sm font-medium hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:scale-90 transition-all shadow-sm"
                        >
                          ✕
                        </button>
                      )}
                      {uploadProgress >= 0 && (
                        <div className="absolute inset-0 bg-black/60 rounded-lg flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
                          <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          <span className="text-white text-xs font-semibold tabular-nums">{uploadProgress}%</span>
                          <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => { setUploadProgress(-1); setSending(false); clearImagePreview(); }}
                            className="text-white/70 text-[10px] font-medium mt-1 hover:text-white active:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Voice recorder or normal input */}
                {isRecordingVoice ? (
                  <VoiceRecorder
                    onSend={handleVoiceSend}
                    onCancel={() => setIsRecordingVoice(false)}
                  />
                ) : (
                  <div className="chat-input-safe px-3 py-2 flex items-end gap-1.5 min-w-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      onChange={handleImageSelect}
                      className="hidden"
                      aria-label="Upload image"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending || uploadProgress >= 0 || !currentUserProfile}
                      aria-label="Attach image"
                      className="p-2.5 min-w-[44px] min-h-[44px] rounded-full text-[var(--text-muted)] active:text-[var(--text-primary)] active:bg-[var(--bg-secondary)] transition-colors-fast disabled:opacity-30 flex-shrink-0 flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                    </button>
                    <label htmlFor="message-input" className="sr-only">Type a message</label>
                    <textarea
                      ref={messageInputRef}
                      id="message-input"
                      value={newMessage}
                      onChange={(e) => { setNewMessage(e.target.value); handleTyping(); handleInputResize(e.target); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                      placeholder="Message..."
                      disabled={!currentUserProfile}
                      rows={1}
                      className="chat-textarea flex-1 min-w-0 resize-none px-4 py-2.5 rounded-2xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none disabled:opacity-50 text-[16px] leading-[1.35]"
                      style={{ height: 'auto', minHeight: '44px', scrollbarGutter: 'stable' }}
                    />
                    {newMessage.trim() || imageFile ? (
                      <button
                        type="submit"
                        disabled={sending || !currentUserProfile}
                        aria-label="Send message"
                        className="p-2.5 min-w-[44px] min-h-[44px] rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] disabled:opacity-30 active:scale-90 transition-all flex-shrink-0 flex items-center justify-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                        </svg>
                      </button>
                    ) : typeof MediaRecorder !== 'undefined' ? (
                      <button
                        type="button"
                        onClick={() => setIsRecordingVoice(true)}
                        disabled={sending || !currentUserProfile}
                        aria-label="Record voice message"
                        className="p-2.5 min-w-[44px] min-h-[44px] rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors-fast disabled:opacity-30 flex-shrink-0 flex items-center justify-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                )}
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-[var(--text-muted)]">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="font-medium">Select a conversation</p>
              <Link href="/explore" className="text-[var(--accent-primary)] text-sm mt-2">Find new people</Link>
            </div>
          )}
        </div>
      </div>

      {/* Image lightbox — pinch-to-zoom, swipe dismiss, URL refresh */}
      {enlargedImage && (
        <LightboxModal
          url={enlargedImage.url}
          mediaPath={enlargedImage.mediaPath}
          onClose={() => setEnlargedImage(null)}
          onRefreshUrl={async (path) => {
            const fresh = await getOrRefreshSignedUrl(path);
            if (fresh) setEnlargedImage({ url: fresh, mediaPath: path });
            return fresh;
          }}
        />
      )}
      {/* Delete conversation confirmation */}
      {deleteConvId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete conversation"
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setDeleteConvId(null)}
        >
          <div
            className="bg-[var(--bg-secondary)] rounded-2xl p-5 w-[320px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">Delete conversation?</h3>
            <p className="text-sm text-[var(--text-muted)] mb-5">This will remove the conversation from your inbox. The other person will still see it.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConvId(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConversation}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-[var(--accent-red)] text-white hover:opacity-90 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {blockUserId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Block user"
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setBlockUserId(null)}
        >
          <div
            className="bg-[var(--bg-secondary)] rounded-2xl p-5 w-[320px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">Block this person?</h3>
            <p className="text-sm text-[var(--text-muted)] mb-5">They won&apos;t be able to find your profile, posts, or stories on kwen. They won&apos;t be notified that you blocked them.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setBlockUserId(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBlock}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-[var(--accent-red)] text-white hover:opacity-90 transition-opacity"
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward message dialog */}
      {forwardMessage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Forward message"
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center"
          onClick={() => { setForwardMessage(null); setForwardSearch(''); }}
        >
          <div
            className="bg-[var(--bg-secondary)] w-full md:w-[420px] md:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col animate-slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Forward to</h3>
                <button
                  onClick={() => { setForwardMessage(null); setForwardSearch(''); }}
                  className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              {/* Message preview */}
              <div className="px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] mb-3">
                <p className="text-xs text-[var(--text-muted)] mb-0.5">{forwardMessage.sender?.display_name || 'User'}</p>
                <p className="text-sm text-[var(--text-primary)] line-clamp-2 break-all">{forwardMessage.content || (forwardMessage.message_type === 'image' ? '📷 Photo' : forwardMessage.message_type === 'voice' ? '🎤 Voice message' : 'Media')}</p>
              </div>
              {/* Search */}
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  placeholder="Search conversations"
                  value={forwardSearch}
                  onChange={(e) => setForwardSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--bg-tertiary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
              {conversations
                .filter(c => c.id !== selectedId)
                .filter(c => {
                  if (!forwardSearch.trim()) return true;
                  const q = forwardSearch.toLowerCase();
                  return c.other_user?.display_name?.toLowerCase().includes(q) || c.other_user?.username?.toLowerCase().includes(q);
                })
                .map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleForward(conv.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors text-left"
                  >
                    <Avatar
                      src={conv.other_user?.avatar_url || null}
                      name={conv.other_user?.display_name || 'User'}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-[var(--text-primary)] truncate">{conv.other_user?.display_name || 'User'}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">@{conv.other_user?.username}</p>
                    </div>
                  </button>
                ))
              }
              {conversations.filter(c => c.id !== selectedId).length === 0 && (
                <p className="text-center text-sm text-[var(--text-muted)] py-6">No other conversations</p>
              )}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
