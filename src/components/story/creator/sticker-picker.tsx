'use client';

import { useState } from 'react';

type StickerType = 'mention' | 'hashtag' | 'link' | 'location' | 'poll' | 'question' | 'countdown';

interface StickerPickerProps {
  onAddSticker: (type: StickerType, data: any) => void;
  onClose: () => void;
}

const STICKER_TYPES = [
  {
    type: 'mention' as StickerType,
    icon: '📢',
    label: 'Mention',
    description: 'Tag someone',
  },
  {
    type: 'hashtag' as StickerType,
    icon: '#',
    label: 'Hashtag',
    description: 'Add a hashtag',
  },
  {
    type: 'link' as StickerType,
    icon: '🔗',
    label: 'Link',
    description: 'Add a URL',
  },
  {
    type: 'location' as StickerType,
    icon: '📍',
    label: 'Location',
    description: 'Add location',
  },
  {
    type: 'poll' as StickerType,
    icon: '📊',
    label: 'Poll',
    description: 'Create a poll',
  },
  {
    type: 'question' as StickerType,
    icon: '❓',
    label: 'Question',
    description: 'Ask a question',
  },
  {
    type: 'countdown' as StickerType,
    icon: '⏰',
    label: 'Countdown',
    description: 'Set a timer',
  },
];

export function StickerPicker({ onAddSticker, onClose }: StickerPickerProps) {
  const [activeSticker, setActiveSticker] = useState<StickerType | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const handleTypeSelect = (type: StickerType) => {
    setActiveSticker(type);
    setInputValue('');
    setPollOptions(['', '']);
  };

  const handleSubmit = () => {
    if (!activeSticker) return;

    let data: any = {};

    switch (activeSticker) {
      case 'mention':
      case 'hashtag':
      case 'link':
      case 'location':
        if (!inputValue.trim()) return;
        data = { text: inputValue.trim() };
        break;
      case 'poll':
        const validOptions = pollOptions.filter(o => o.trim());
        if (validOptions.length < 2 || !inputValue.trim()) return;
        data = {
          question: inputValue.trim(),
          options: validOptions,
        };
        break;
      case 'question':
        if (!inputValue.trim()) return;
        data = { question: inputValue.trim() };
        break;
      case 'countdown':
        if (!inputValue.trim()) return;
        data = { title: inputValue.trim() };
        break;
    }

    onAddSticker(activeSticker, data);
    onClose();
  };

  const addPollOption = () => {
    if (pollOptions.length < 4) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-secondary)] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
          <h3 className="text-white font-semibold">Stickers</h3>
        </div>

        {/* Sticker type selector */}
        {!activeSticker && (
          <div className="grid grid-cols-4 gap-3 p-4">
            {STICKER_TYPES.map((sticker) => (
              <button
                key={sticker.type}
                onClick={() => handleTypeSelect(sticker.type)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] transition-colors"
              >
                <span className="text-3xl">{sticker.icon}</span>
                <span className="text-xs text-[var(--text-muted)]">{sticker.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input form */}
        {activeSticker && (
          <div className="p-4 space-y-4">
            {/* Back button */}
            <button
              onClick={() => setActiveSticker(null)}
              className="text-[var(--text-muted)] hover:text-white flex items-center gap-2 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>

            {/* Label */}
            <div className="flex items-center gap-2">
              <span className="text-2xl">
                {STICKER_TYPES.find(s => s.type === activeSticker)?.icon}
              </span>
              <span className="text-white font-medium">
                {STICKER_TYPES.find(s => s.type === activeSticker)?.label}
              </span>
            </div>

            {/* Main input */}
            {activeSticker === 'poll' ? (
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
                  {pollOptions.length < 4 && (
                    <button
                      onClick={addPollOption}
                      className="text-[var(--accent-primary)] text-sm"
                    >
                      + Add option
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  activeSticker === 'mention' ? '@username' :
                  activeSticker === 'hashtag' ? '#hashtag' :
                  activeSticker === 'link' ? 'https://...' :
                  activeSticker === 'location' ? 'Location name' :
                  activeSticker === 'question' ? 'Ask a question...' :
                  'Title'
                }
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-white placeholder:text-[var(--text-muted)] border-none focus:outline-none focus:ring-2 focus:ring-white/20"
                autoFocus
              />
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-[var(--text-inverse)] font-semibold hover:opacity-90 transition-opacity"
            >
              Add Sticker
            </button>
          </div>
        )}
      </div>
    </div>
  );
}