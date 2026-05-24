'use client'

import { useState } from 'react'

interface QuestionStickerProps {
  question: string
  onQuestionChange: (q: string) => void
}

export function QuestionSticker({
  question,
  onQuestionChange,
}: QuestionStickerProps) {
  return (
    <div className="bg-[var(--accent-primary)] rounded-2xl p-4 w-72">
      <p className="text-center text-[var(--text-inverse)]/80 text-sm mb-2">Ask me anything</p>
      <input
        type="text"
        value={question}
        onChange={(e) => onQuestionChange(e.target.value)}
        placeholder="Type your question..."
        className="w-full text-center text-lg font-semibold text-[var(--text-inverse)] placeholder:text-[var(--text-inverse)]/50 bg-transparent outline-none"
        maxLength={80}
      />
    </div>
  )
}

// Display version for story viewer
interface QuestionDisplayProps {
  question: {
    id: string
    question: string
  }
  isOwner: boolean
  onSubmitResponse?: (response: string) => void
  onViewResponses?: () => void
  responseCount?: number
}

export function QuestionDisplay({
  question,
  isOwner,
  onSubmitResponse,
  onViewResponses,
  responseCount = 0,
}: QuestionDisplayProps) {
  const [response, setResponse] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (!response.trim() || !onSubmitResponse) return
    onSubmitResponse(response.trim())
    setSubmitted(true)
    setResponse('')
  }

  return (
    <div className="bg-[var(--accent-primary)] rounded-2xl p-4 w-72">
      {/* Question */}
      <p className="text-center text-[var(--text-inverse)] text-lg font-semibold mb-3">
        {question.question}
      </p>

      {isOwner ? (
        /* Owner sees response count */
        <button
          onClick={onViewResponses}
          className="w-full py-2 px-4 rounded-xl bg-[var(--text-inverse)]/20 text-[var(--text-inverse)] text-sm hover:bg-[var(--text-inverse)]/30 transition-colors"
        >
          {responseCount > 0
            ? `View ${responseCount} ${responseCount === 1 ? 'response' : 'responses'}`
            : 'No responses yet'
          }
        </button>
      ) : submitted ? (
        /* User submitted response */
        <div className="text-center text-[var(--text-inverse)]/80 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-1">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Response sent!
        </div>
      ) : (
        /* User can respond */
        <div className="space-y-2">
          <input
            type="text"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Type your response..."
            className="w-full px-4 py-2 rounded-xl bg-[var(--text-inverse)]/20 text-[var(--text-inverse)] placeholder:text-[var(--text-inverse)]/50 outline-none focus:bg-[var(--text-inverse)]/30"
            maxLength={200}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button
            onClick={handleSubmit}
            disabled={!response.trim()}
            className="w-full py-2 rounded-xl bg-[var(--text-inverse)] text-[var(--accent-primary)] font-semibold hover:bg-[var(--text-inverse)]/90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  )
}
