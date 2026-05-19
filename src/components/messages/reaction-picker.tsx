'use client';

const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  currentReaction?: string | null;
}

export function ReactionPicker({ onSelect, currentReaction }: ReactionPickerProps) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] shadow-lg"
      role="radiogroup"
      aria-label="Choose a reaction"
    >
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          role="radio"
          aria-checked={currentReaction === emoji}
          aria-label={`React with ${emoji}`}
          className={`w-9 h-9 flex items-center justify-center rounded-full text-lg transition-all hover:scale-125 active:scale-95 ${
            currentReaction === emoji
              ? 'bg-[var(--accent-primary)]/20 scale-110'
              : 'hover:bg-[var(--bg-tertiary)]'
          }`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export { REACTIONS };
