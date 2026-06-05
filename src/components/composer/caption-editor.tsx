'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CaptionEditorProps {
  value: string
  onChange: (value: string) => void
  maxLength?: number
  placeholder?: string
}

interface MentionSuggestion {
  username: string
  display_name: string
  avatar_url: string | null
}

export function CaptionEditor({
  value,
  onChange,
  maxLength = 2200,
  placeholder = 'Write a caption...',
}: CaptionEditorProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [value])

  // Search for mentions
  useEffect(() => {
    if (mentionQuery === null) {
      setShowMentions(false)
      return
    }

    const search = async () => {
      if (mentionQuery.length < 2) {
        setShowMentions(false)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .or(`username.ilike.${mentionQuery}%,display_name.ilike.${mentionQuery}%`)
        .limit(5)

      setMentionSuggestions(data || [])
      setShowMentions((data || []).length > 0)
    }

    const timer = setTimeout(search, 200)
    return () => clearTimeout(timer)
  }, [mentionQuery])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    if (newValue.length > maxLength) return
    onChange(newValue)

    // Check for @mention trigger
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = newValue.slice(0, cursorPos)
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/)

    if (mentionMatch) {
      setMentionQuery(mentionMatch[1])
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = (username: string) => {
    if (!textareaRef.current) return
    const cursorPos = textareaRef.current.selectionStart
    const textBeforeCursor = value.slice(0, cursorPos)
    const textAfterCursor = value.slice(cursorPos)

    const mentionStart = textBeforeCursor.lastIndexOf('@')
    const newText = textBeforeCursor.slice(0, mentionStart) + `@${username} ` + textAfterCursor

    onChange(newText)
    setMentionQuery(null)
    setShowMentions(false)

    // Refocus textarea
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 0)
  }

  const insertEmoji = (emoji: string) => {
    if (!textareaRef.current) return
    const cursorPos = textareaRef.current.selectionStart
    const textBefore = value.slice(0, cursorPos)
    const textAfter = value.slice(cursorPos)
    const newText = textBefore + emoji + textAfter

    if (newText.length <= maxLength) {
      onChange(newText)
    }
    setShowEmojiPicker(false)

    setTimeout(() => {
      textareaRef.current?.focus()
    }, 0)
  }

  const charCount = value.length
  const charPercent = (charCount / maxLength) * 100
  const isNearLimit = charPercent > 90

  return (
    <div className="relative flex-1 flex flex-col">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full min-h-[120px] p-3 bg-transparent text-[var(--text-primary)] text-sm resize-none outline-none overflow-x-hidden overflow-y-auto placeholder:text-[var(--text-muted)]" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
          rows={4}
        />

        {/* Mention suggestions */}
        {showMentions && (
          <div className="absolute left-3 bottom-0 w-64 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg z-10 overflow-hidden">
            {mentionSuggestions.map((user) => (
              <button
                key={user.username}
                onClick={() => insertMention(user.username)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--bg-secondary)] flex-shrink-0">
                  {user.avatar_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-[var(--text-muted)]">
                      {user.display_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.username}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{user.display_name}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" x2="9.01" y1="9" y2="9" />
              <line x1="15" x2="15.01" y1="9" y2="9" />
            </svg>
          </button>
          <span className="text-xs text-[var(--text-muted)]">@ #</span>
        </div>

        {/* Character counter */}
        <div className="flex items-center gap-2">
          <div className="relative w-5 h-5">
            <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="8" fill="none" stroke="var(--bg-secondary)" strokeWidth="2" />
              <circle
                cx="10" cy="10" r="8" fill="none"
                stroke={isNearLimit ? 'var(--destructive)' : 'var(--text-muted)'}
                strokeWidth="2"
                strokeDasharray={`${charPercent * 0.5} 50`}
                strokeLinecap="round"
              />
            </svg>
          </div>
          {isNearLimit && (
            <span className={`text-xs ${charCount >= maxLength ? 'text-[var(--destructive)]' : 'text-[var(--text-muted)]'}`}>
              {maxLength - charCount}
            </span>
          )}
        </div>
      </div>

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div className="absolute bottom-14 left-0 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg z-10 p-3 w-72">
          <div className="grid grid-cols-8 gap-1">
            {['😊', '😂', '❤️', '😍', '🔥', '👍', '🎉', '😢',
              '😎', '🥳', '😘', '🤩', '💪', '🙌', '✨', '💯',
              '😭', '🥺', '😤', '🤯', '💀', '🫡', '🤝', '👀',
              '🫶', '💅', '🧘', '🌈', '☀️', '🌙', '⭐', '🎵',
              '📸', '🎬', '🍕', '☕', '🍿', '🏆', '🎮', '🚀'].map(emoji => (
              <button
                key={emoji}
                onClick={() => insertEmoji(emoji)}
                className="w-8 h-8 flex items-center justify-center hover:bg-[var(--bg-secondary)] rounded-lg text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
