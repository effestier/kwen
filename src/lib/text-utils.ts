import React from 'react'

/**
 * Extract hashtags from text
 */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u0400-\u04FF]+/g)
  if (!matches) return []
  return [...new Set(matches.map(tag => tag.slice(1).toLowerCase()))]
}

/**
 * Extract @mentions from text
 */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@[\w.]+/g)
  if (!matches) return []
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))]
}

/**
 * Render text with clickable hashtags and mentions
 * Returns React elements
 */
export function renderRichText(text: string): React.ReactNode[] {
  if (!text) return [text]

  const parts: React.ReactNode[] = []
  // Split on @mentions, #hashtags, and newlines
  const regex = /(@[\w.]+|#[\w\u0400-\u04FF]+|\n)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]

    if (token === '\n') {
      parts.push(React.createElement('br', { key: `br-${match.index}` }))
    } else if (token.startsWith('@')) {
      const username = token.slice(1)
      parts.push(
        React.createElement(
          'a',
          {
            key: `mention-${match.index}`,
            href: `/profile/${username}`,
            className: 'text-[var(--accent-primary)] font-medium hover:underline',
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation()
            },
          },
          token
        )
      )
    } else if (token.startsWith('#')) {
      const tag = token.slice(1)
      parts.push(
        React.createElement(
          'a',
          {
            key: `hashtag-${match.index}`,
            href: `/explore/tags/${tag}`,
            className: 'text-[var(--accent-primary)] font-medium hover:underline',
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation()
            },
          },
          token
        )
      )
    }

    lastIndex = match.index + token.length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}
