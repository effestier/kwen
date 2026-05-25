'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';

type StickerType = 'mention' | 'hashtag' | 'link' | 'location' | 'poll' | 'question' | 'countdown' | 'emoji' | 'time' | 'date';

interface StickerPickerProps {
  onAddSticker: (type: StickerType, data: Record<string, unknown>) => void;
  onClose: () => void;
}

const STICKER_TYPES = [
  { type: 'mention' as StickerType, label: 'Mention', icon: '@' },
  { type: 'hashtag' as StickerType, label: 'Hashtag', icon: '#' },
  { type: 'link' as StickerType, label: 'Link', icon: '🔗' },
  { type: 'location' as StickerType, label: 'Location', icon: '📍' },
  { type: 'poll' as StickerType, label: 'Poll', icon: '📊' },
  { type: 'question' as StickerType, label: 'Question', icon: '❓' },
  { type: 'countdown' as StickerType, label: 'Countdown', icon: '⏰' },
  { type: 'emoji' as StickerType, label: 'Emoji', icon: '😀' },
  { type: 'time' as StickerType, label: 'Time', icon: '🕐' },
  { type: 'date' as StickerType, label: 'Date', icon: '📅' },
];

// M15: Added search labels so emoji search actually filters
const EMOJI_DATA: { emoji: string; labels: string }[] = [
  { emoji: '😀', labels: 'happy smile grin' },
  { emoji: '😂', labels: 'laugh lol cry tears funny' },
  { emoji: '🥰', labels: 'love hearts blush' },
  { emoji: '😍', labels: 'love heart eyes crush' },
  { emoji: '🤩', labels: 'star wow amazed' },
  { emoji: '😎', labels: 'cool sunglasses' },
  { emoji: '🥳', labels: 'party celebrate' },
  { emoji: '😇', labels: 'angel halo innocent' },
  { emoji: '🔥', labels: 'fire hot lit' },
  { emoji: '💯', labels: 'hundred perfect score' },
  { emoji: '❤️', labels: 'love heart red' },
  { emoji: '💖', labels: 'sparkle heart love' },
  { emoji: '✨', labels: 'sparkle stars magic' },
  { emoji: '⭐', labels: 'star' },
  { emoji: '🌟', labels: 'glow star bright' },
  { emoji: '💫', labels: 'dizzy star' },
  { emoji: '🎉', labels: 'party celebration tada' },
  { emoji: '🎊', labels: 'confetti party' },
  { emoji: '🎈', labels: 'balloon party' },
  { emoji: '🎁', labels: 'gift present' },
  { emoji: '🏆', labels: 'trophy champion winner' },
  { emoji: '💪', labels: 'strong muscle flex' },
  { emoji: '🙌', labels: 'hands praise' },
  { emoji: '👏', labels: 'clap applause' },
  { emoji: '🌹', labels: 'rose flower' },
  { emoji: '🌸', labels: 'cherry blossom flower' },
  { emoji: '🌺', labels: 'hibiscus flower' },
  { emoji: '🍀', labels: 'clover luck four leaf' },
  { emoji: '🌈', labels: 'rainbow' },
  { emoji: '☀️', labels: 'sun sunny bright' },
  { emoji: '🌙', labels: 'moon night' },
  { emoji: '⚡', labels: 'lightning bolt electric' },
  { emoji: '🍕', labels: 'pizza food' },
  { emoji: '🍔', labels: 'burger food' },
  { emoji: '🍟', labels: 'fries food' },
  { emoji: '🍦', labels: 'ice cream dessert' },
  { emoji: '☕', labels: 'coffee tea drink' },
  { emoji: '🍰', labels: 'cake dessert' },
  { emoji: '🍩', labels: 'donut dessert' },
  { emoji: '🧁', labels: 'cupcake dessert' },
  { emoji: '🎵', labels: 'music note' },
  { emoji: '🎶', labels: 'music notes' },
  { emoji: '🎸', labels: 'guitar music' },
  { emoji: '🎤', labels: 'microphone mic karaoke' },
  { emoji: '🎧', labels: 'headphones music' },
  { emoji: '📸', labels: 'camera photo' },
  { emoji: '🎬', labels: 'movie film clapper' },
  { emoji: '🎮', labels: 'gaming controller' },
  { emoji: '✈️', labels: 'airplane travel' },
  { emoji: '🚗', labels: 'car drive' },
  { emoji: '🏠', labels: 'house home' },
  { emoji: '🏖️', labels: 'beach vacation' },
  { emoji: '🗼', labels: 'tower landmark' },
  { emoji: '🗽', labels: 'statue liberty' },
  { emoji: '🎡', labels: 'ferris wheel carnival' },
  { emoji: '🎢', labels: 'roller coaster carnival' },
  { emoji: '💀', labels: 'skull dead' },
  { emoji: '👻', labels: 'ghost boo' },
  { emoji: '🤡', labels: 'clown funny' },
  { emoji: '👽', labels: 'alien ufo' },
  { emoji: '🤖', labels: 'robot bot' },
  { emoji: '💩', labels: 'poop' },
  { emoji: '🙈', labels: 'monkey shy hide' },
  { emoji: '🙉', labels: 'monkey hear no' },
];

export function StickerPicker({ onAddSticker, onClose }: StickerPickerProps) {
  const [activeSticker, setActiveSticker] = useState<StickerType | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [countdownDate, setCountdownDate] = useState('');
  const [countdownTime, setCountdownTime] = useState('00:00');
  const [emojiSearch, setEmojiSearch] = useState('');
  const [mentionResults, setMentionResults] = useState<{ id: string; username: string; display_name: string }[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default countdown to 24h from now
  useEffect(() => {
    if (activeSticker === 'countdown') {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setCountdownDate(tomorrow.toISOString().split('T')[0]);
      setCountdownTime('12:00');
    }
  }, [activeSticker]);

  // Debounced mention search
  const searchMentions = useCallback((query: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setMentionResults([]);
      return;
    }

    setMentionLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
          .limit(10);
        setMentionResults(data || []);
      } catch {
        setMentionResults([]);
      }
      setMentionLoading(false);
    }, 300);
  }, []);

  const handleTypeSelect = (type: StickerType) => {
    setActiveSticker(type);
    setInputValue('');
    setPollOptions(['', '']);
    setEmojiSearch('');
    setMentionResults([]);
    hapticLight();
  };

  const handleSubmit = () => {
    if (!activeSticker) return;

    switch (activeSticker) {
      case 'mention':
      case 'hashtag':
      case 'link':
      case 'location':
        if (!inputValue.trim()) return;
        onAddSticker(activeSticker, { text: inputValue.trim() });
        break;
      case 'poll': {
        const validOptions = pollOptions.filter(o => o.trim());
        if (validOptions.length < 2 || !inputValue.trim()) return;
        onAddSticker('poll', { question: inputValue.trim(), options: validOptions });
        break;
      }
      case 'question':
        if (!inputValue.trim()) return;
        onAddSticker('question', { question: inputValue.trim() });
        break;
      case 'countdown': {
        if (!inputValue.trim()) return;
        const endTime = new Date(`${countdownDate}T${countdownTime}`).toISOString();
        onAddSticker('countdown', { title: inputValue.trim(), endTime });
        break;
      }
    }

    onClose();
  };

  // H28: DB schema only supports 2 poll options (option_1, option_2). Cap at 2.
  // const addPollOption = () => {
  //   if (pollOptions.length < 4) {
  //     setPollOptions([...pollOptions, '']);
  //   }
  // };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  // M15: Actually filter emojis by search term
  const filteredEmojis = emojiSearch
    ? EMOJI_DATA.filter(e => e.labels.includes(emojiSearch.toLowerCase())).map(e => e.emoji)
    : EMOJI_DATA.map(e => e.emoji);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-end">
      <div className="w-full max-h-[80vh] bg-[var(--bg-secondary)] rounded-t-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border-subtle)] flex-shrink-0">
          {activeSticker ? (
            <button
              onClick={() => setActiveSticker(null)}
              className="text-[var(--text-muted)] hover:text-white"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          ) : (
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          )}
          <h3 className="text-white font-semibold flex-1">
            {activeSticker ? (STICKER_TYPES.find(s => s.type === activeSticker)?.label || 'Sticker') : 'Stickers'}
          </h3>
          {activeSticker && (
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Sticker type grid */}
          {!activeSticker && (
            <div className="grid grid-cols-5 gap-3 p-4">
              {STICKER_TYPES.map((sticker) => (
                <button
                  key={sticker.type}
                  onClick={() => handleTypeSelect(sticker.type)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] transition-colors"
                >
                  <span className="text-2xl">{sticker.icon}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{sticker.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Quick add stickers (time, date, emoji) — add immediately on tap */}
          {activeSticker === 'time' && (
            <div className="p-4">
              <button
                onClick={() => {
                  onAddSticker('time', {});
                  onClose();
                }}
                className="w-full p-4 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] flex items-center gap-4 transition-colors"
              >
                <div className="bg-white/90 rounded-full px-4 py-2">
                  <span className="text-black font-semibold text-sm">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="text-white text-sm">Add time sticker</span>
              </button>
            </div>
          )}

          {activeSticker === 'date' && (
            <div className="p-4">
              <button
                onClick={() => {
                  onAddSticker('date', {});
                  onClose();
                }}
                className="w-full p-4 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] flex items-center gap-4 transition-colors"
              >
                <div className="bg-white/90 rounded-full px-4 py-2">
                  <span className="text-black font-semibold text-sm">
                    {new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <span className="text-white text-sm">Add date sticker</span>
              </button>
            </div>
          )}

          {/* Emoji picker */}
          {activeSticker === 'emoji' && (
            <div className="p-4">
              <div className="mb-3">
                <input
                  type="text"
                  value={emojiSearch}
                  onChange={(e) => setEmojiSearch(e.target.value)}
                  placeholder="Search emoji..."
                  className="w-full px-4 py-2 rounded-xl bg-[var(--bg-tertiary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none text-sm"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-8 gap-1">
                {filteredEmojis.map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onAddSticker('emoji', { emoji });
                      onClose();
                    }}
                    className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input form for interactive stickers */}
          {activeSticker && !['time', 'date', 'emoji'].includes(activeSticker) && (
            <div className="p-4 space-y-4">
              {/* Mention: autocomplete search */}
              {activeSticker === 'mention' && (
                <>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      searchMentions(e.target.value);
                    }}
                    placeholder="@username"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none focus:ring-2 focus:ring-white/20"
                    autoFocus
                  />
                  {mentionLoading && (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                  {mentionResults.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {mentionResults.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => {
                            onAddSticker('mention', { text: `@${user.username}`, userId: user.id });
                            onClose();
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                            <span className="text-white text-xs">{user.username.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">@{user.username}</p>
                            <p className="text-[var(--text-muted)] text-xs">{user.display_name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Non-mention inputs */}
              {activeSticker !== 'mention' && activeSticker !== 'poll' && (
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={
                    activeSticker === 'hashtag' ? '#hashtag' :
                    activeSticker === 'link' ? 'https://...' :
                    activeSticker === 'location' ? 'Location name' :
                    activeSticker === 'question' ? 'Ask a question...' :
                    activeSticker === 'countdown' ? 'Countdown title' :
                    'Enter text'
                  }
                  className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none focus:ring-2 focus:ring-white/20"
                  autoFocus
                />
              )}

              {/* Poll-specific inputs */}
              {activeSticker === 'poll' && (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask a question..."
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none focus:ring-2 focus:ring-white/20"
                    autoFocus
                  />
                  <div className="space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <input
                        key={idx}
                        type="text"
                        value={opt}
                        onChange={(e) => updatePollOption(idx, e.target.value)}
                        placeholder={`Option ${idx + 1}`}
                        className="w-full px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--border-soft)]"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Countdown date/time inputs */}
              {activeSticker === 'countdown' && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[var(--text-muted)] text-xs mb-1">End date</label>
                    <input
                      type="date"
                      value={countdownDate}
                      onChange={(e) => setCountdownDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-white border-none focus:outline-none text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[var(--text-muted)] text-xs mb-1">End time</label>
                    <input
                      type="time"
                      value={countdownTime}
                      onChange={(e) => setCountdownTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-white border-none focus:outline-none text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Link validation hint */}
              {activeSticker === 'link' && inputValue && !inputValue.startsWith('http') && (
                <p className="text-[var(--warning)] text-xs">URL should start with https://</p>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmit}
                className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:opacity-90 transition-opacity"
              >
                Add Sticker
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
