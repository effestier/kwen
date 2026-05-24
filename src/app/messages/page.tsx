'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { getMessages, sendMessage, markConversationAsRead, markMessagesAsDelivered, markMessagesAsSeen, getSignedUrl, addReaction, deleteMessage, reportMessage } from '@/services/messages';
import type { MediaMetadata } from '@/services/messages';
import { MessageBubble, type MessageBubbleData } from '@/components/messages/message-bubble';
import { ReplyPreview } from '@/components/messages/reply-preview';
import { compressForMessage, generateThumbnail, validateRawFile, verifyImageContent } from '@/lib/image-compress';
import { ListSkeleton, Skeleton } from '@/components/design-system/skeleton';
import { VoiceRecorder } from '@/components/messages/voice-recorder';
import { isNativePlatform } from '@/lib/platform';

// Debug: platform + mic permission probe (runs once per session)
if (typeof window !== 'undefined' && !(window as any).__voiceDebugProbed) {
  (window as any).__voiceDebugProbed = true;
  const probe = async () => {
    const info: Record<string, unknown> = {
      isNative: isNativePlatform(),
      userAgent: navigator.userAgent,
      hasMediaRecorder: typeof MediaRecorder !== 'undefined',
      hasGetUserMedia: !!(navigator.mediaDevices?.getUserMedia),
      isSecureContext: window.isSecureContext,
    };
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        info.micPermission = status.state;
      }
    } catch (e) {
      info.micPermission = 'query_failed';
    }
    console.log('[VOICE][PLATFORM]', info);
  };
  probe();
}

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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(-1); // -1 = idle, 0-100 = uploading
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [failedMessages, setFailedMessages] = useState<Map<string, FailedMessageData>>(new Map());
  const [replyTo, setReplyTo] = useState<MessageBubbleData | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debug: track every isRecordingVoice change
  useEffect(() => {
    console.log('[PAGE] isRecordingVoice changed:', isRecordingVoice);
  }, [isRecordingVoice]);

  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // User state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

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
  const isSubscribedRef = useRef<boolean>(false);
  const signedUrlCacheRef = useRef<Map<string, { url: string; expiresAt: number }>>(new Map());
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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
        .select('conversation_id, unread_count, last_read_at, conversations!inner(updated_at)')
        .eq('user_id', user.id)
        .order('conversations(updated_at)', { ascending: false })
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
          last_message: lastMsg?.message_type === 'image' ? 'Photo' : lastMsg?.message_type === 'voice' ? '🎤 Voice message' : lastMsg?.message_type === 'mixed' ? `Photo · ${lastMsg.content}` : (lastMsg?.content || 'Start a conversation'),
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
              const preview = msg.message_type === 'image' ? 'Photo' : msg.message_type === 'voice' ? '🎤 Voice message' : msg.message_type === 'mixed' ? `Photo · ${msg.content}` : msg.content;
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
      if (reactionsChannelRef.current) { supabase.removeChannel(reactionsChannelRef.current); reactionsChannelRef.current = null; }

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
      // Mark all unseen/undelivered messages from others as delivered + seen
      await markMessagesAsDelivered(selectedId as string);
      const seenIds = await markMessagesAsSeen(selectedId as string);
      if (seenIds.length > 0) {
        setMessages(prev => prev.map(m => seenIds.includes(m.id) ? { ...m, seen_at: new Date().toISOString() } : m));
      }
      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, unread_count: 0 } : c));

      const messageChannel = supabase
        .channel(`messages-${selectedId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` }, async (payload) => {
          // Handle UPDATE events for read receipts
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as { id: string; delivered_at?: string; seen_at?: string };
            setMessages(prev => prev.map(m => {
              if (m.id !== updated.id) return m;
              const next = { ...m };
              if (updated.delivered_at && !m.delivered_at) next.delivered_at = updated.delivered_at;
              if (updated.seen_at && !m.seen_at) next.seen_at = updated.seen_at;
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
            const seenIds = await markMessagesAsSeen(selectedIdRef.current!);
            if (seenIds.length > 0) {
              setMessages(prev => prev.map(m => seenIds.includes(m.id) ? { ...m, seen_at: new Date().toISOString() } : m));
            }
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
      isSubscribedRef.current = false;
      if (messageChannelRef.current) { supabase.removeChannel(messageChannelRef.current); messageChannelRef.current = null; }
      if (typingChannelRef.current) { supabase.removeChannel(typingChannelRef.current); typingChannelRef.current = null; }
      if (reactionsChannelRef.current) { supabase.removeChannel(reactionsChannelRef.current); reactionsChannelRef.current = null; }
    };
  }, [selectedId, currentUserId, currentUserProfile, deduplicateMessages]);

  // Scroll to bottom when messages change
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

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
      const result = await sendMessage(sid, '', media, undefined, undefined, failedData.duration);
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
    setMessages(prev => prev.filter(m => m.id !== tempId));
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
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } else if (result.action === 'deleted_for_everyone') {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: 'This message was deleted', message_type: 'text', media_url: null, thumbnail_url: null } : m));
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
    const result = await reportMessage(messageId);
    if (result.message) {
      showToast(result.message, 'success');
    }
  }, []);

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

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

    const result = await sendMessage(sid, displayContent, media, replyTo?.id);
    setReplyTo(null);

    if (result.success && result.message) {
      tid.delete(tempId);
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
      // Mark as failed instead of removing — user can retry
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' as const } : m));
      setFailedMessages(prev => new Map(prev).set(tempId, { content: displayContent, media, file: imageFile ?? undefined, replyToMessageId: replyTo?.id }));
    }
    setSending(false);
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

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' as const } : m));
      setFailedMessages(prev => new Map(prev).set(tempId, { content: '', blob, duration }));
    }
    setSending(false);
  }, [uploadWithProgress, showToast, deduplicateMessages]);

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
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return (
    <MainLayout>
      {/* Expose unread count for sidebar/mobile nav to read */}
      <div id="messages-unread-count" data-count={totalUnread} className="hidden" />

      <div className="flex h-[calc(100dvh-57px)] lg:h-[calc(100vh-57px)]">
        {/* Conversations List */}
        <div className={cn(
          "w-full md:w-80 border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-primary)]",
          showMobileChat && 'hidden md:flex'
        )}>
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Messages</h1>
          </div>
          <div role="list" aria-label="Conversations" className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div role="status" className="p-4">
                <ListSkeleton items={6} />
              </div>
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
                          <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent-red)] text-white text-xs font-bold flex items-center justify-center">
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
              <div role="log" aria-label="Messages" aria-live="polite" className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
                {loadingMessages ? (
                  <div role="status" className="py-2 space-y-3">
                    {[40, 60, 50, 55, 35, 50].map((w, i) => (
                      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                        <div className="flex items-end gap-2" style={{ maxWidth: '65%' }}>
                          {i % 2 === 0 && <Skeleton variant="circular" width={32} height={32} className="flex-shrink-0" />}
                          <Skeleton className="rounded-2xl" width={`${w}%`} height={36} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : messages.length > 0 ? (
                  <div className="py-2">
                    {messages.map((msg, i) => {
                      const prevMsg = i > 0 ? messages[i - 1] : null;
                      const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId;

                      // Failed/sending messages use legacy inline rendering
                      if (msg.status === 'failed' || msg.status === 'sending') {
                        return (
                          <div key={msg.id} className={cn('flex w-full mt-2', msg.isMine ? 'justify-end' : 'justify-start')}>
                            <div className={cn('max-w-[75%]')}>
                              <div className={cn('text-sm rounded-2xl px-3.5 py-2', msg.isMine ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-br-md' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-bl-md', msg.status === 'failed' && 'opacity-70')}>
                                {msg.content && msg.content !== 'Photo' && <p className="whitespace-pre-wrap text-sm">{msg.content}</p>}
                              </div>
                              {msg.status === 'failed' && msg.isMine && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[11px] text-[var(--destructive)]">Failed to send</span>
                                  <button type="button" onClick={() => handleRetryMessage(msg.id)} className="text-[11px] text-[var(--accent-primary)] font-medium hover:underline">Retry</button>
                                  <button type="button" onClick={() => handleDeleteFailedMessage(msg.id)} className="text-[11px] text-[var(--text-muted)] hover:underline">Delete</button>
                                </div>
                              )}
                              {msg.status === 'sending' && msg.isMine && (
                                <div className="flex items-center gap-1 mt-1">
                                  <div className="animate-spin w-3 h-3 border border-[var(--text-muted)] border-t-transparent rounded-full" />
                                  <span className="text-[10px] text-[var(--text-muted)]">Sending...</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className={cn('px-2', isConsecutive ? 'mt-[2px]' : 'mt-3')}>
                          <MessageBubble
                            message={msg as MessageBubbleData}
                            showAvatar={!isConsecutive && !msg.isMine}
                            onReact={handleReact}
                            onReply={handleReply}
                            onDelete={handleDelete}
                            onCopy={handleCopy}
                            onReport={handleReport}
                            onSaveMedia={handleSaveMedia}
                            onImageClick={setEnlargedImage}
                            onRefreshUrl={getOrRefreshSignedUrl}
                          />
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
              <form onSubmit={handleSend} className="border-t border-[var(--border-subtle)] shrink-0">
                {/* Reply preview */}
                {replyTo && (
                  <div className="px-3 pt-3 pb-0">
                    <ReplyPreview
                      senderName={replyTo.sender?.display_name || 'Unknown'}
                      content={replyTo.content}
                      messageType={replyTo.message_type}
                      mediaUrl={replyTo.thumbnail_url || replyTo.media_url}
                      onCancel={() => setReplyTo(null)}
                    />
                  </div>
                )}

                {/* Image preview */}
                {imagePreview && (
                  <div className="px-3 pt-3 pb-0">
                    <div className="relative inline-block">
                      <img src={imagePreview} alt="Preview" className="max-h-[120px] rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={clearImagePreview}
                        aria-label="Remove image"
                        className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-muted)] flex items-center justify-center text-xs hover:text-[var(--text-primary)]"
                      >
                        &times;
                      </button>
                      {uploadProgress >= 0 && (
                        <div className="absolute inset-0 bg-black/50 rounded-lg flex flex-col items-center justify-center gap-1">
                          <span className="text-white text-xs font-medium">{uploadProgress}%</span>
                          <div className="w-3/4 h-1 bg-white/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white rounded-full transition-all duration-200"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
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
                  <div className="p-3 flex items-center gap-2">
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
                      className="flex-1 px-4 py-2.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] disabled:opacity-50 text-sm"
                    />
                    {newMessage.trim() || imageFile ? (
                      <button
                        type="submit"
                        disabled={sending || !currentUserProfile}
                        aria-label="Send message"
                        className="p-2.5 rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] disabled:opacity-30 hover:opacity-90 transition-all active:scale-95"
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
                        className="p-2.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors-fast disabled:opacity-30"
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
          onKeyDown={(e) => e.key === 'Escape' && setEnlargedImage(null)}
          tabIndex={0}
          ref={(el) => { if (el) el.focus(); }}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
