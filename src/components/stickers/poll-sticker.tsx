'use client'

import { useState } from 'react'

interface PollStickerProps {
  question: string
  option1: string
  option2: string
  onQuestionChange: (q: string) => void
  onOption1Change: (o: string) => void
  onOption2Change: (o: string) => void
}

export function PollSticker({
  question,
  option1,
  option2,
  onQuestionChange,
  onOption1Change,
  onOption2Change,
}: PollStickerProps) {
  return (
    <div className="bg-[var(--card-bg)] rounded-2xl p-4 w-72 shadow-lg">
      {/* Question */}
      <input
        type="text"
        value={question}
        onChange={(e) => onQuestionChange(e.target.value)}
        placeholder="Ask a question..."
        className="w-full text-center text-lg font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] bg-transparent outline-none mb-3"
        maxLength={80}
      />

      {/* Options */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            value={option1}
            onChange={(e) => onOption1Change(e.target.value)}
            placeholder="Option 1"
            className="w-full px-4 py-3 rounded-xl bg-[var(--accent-muted)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            maxLength={25}
          />
        </div>
        <div className="relative">
          <input
            type="text"
            value={option2}
            onChange={(e) => onOption2Change(e.target.value)}
            placeholder="Option 2"
            className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-[var(--text-secondary)]"
            maxLength={25}
          />
        </div>
      </div>
    </div>
  )
}

// Display version for story viewer
interface PollDisplayProps {
  poll: {
    id: string
    question: string
    option_1: string
    option_2: string
    option_1_count: number
    option_2_count: number
  }
  userVote: number | null
  onVote: (option: 1 | 2) => void
  showResults: boolean
}

export function PollDisplay({
  poll,
  userVote,
  onVote,
  showResults,
}: PollDisplayProps) {
  const totalVotes = poll.option_1_count + poll.option_2_count
  const option1Percent = totalVotes > 0 ? Math.round((poll.option_1_count / totalVotes) * 100) : 50
  const option2Percent = totalVotes > 0 ? Math.round((poll.option_2_count / totalVotes) * 100) : 50

  return (
    <div className="bg-[var(--card-bg)]/95 backdrop-blur-sm rounded-2xl p-4 w-72">
      {/* Question */}
      <p className="text-center text-lg font-semibold text-[var(--text-primary)] mb-3">
        {poll.question}
      </p>

      {/* Options */}
      <div className="space-y-2">
        <button
          onClick={() => !userVote && onVote(1)}
          disabled={!!userVote}
          className={`relative w-full px-4 py-3 rounded-xl overflow-hidden transition-all ${
            userVote === 1
              ? 'ring-2 ring-[var(--accent-primary)]'
              : userVote
                ? 'opacity-70'
                : 'hover:scale-[1.02]'
          }`}
        >
          {/* Background bar */}
          {showResults && (
            <div
              className="absolute inset-0 bg-[var(--accent-muted)] transition-all duration-500"
              style={{ width: `${option1Percent}%` }}
            />
          )}
          <div className="relative flex items-center justify-between">
            <span className="font-medium text-[var(--text-primary)]">{poll.option_1}</span>
            {showResults && (
              <span className="font-semibold text-[var(--text-primary)]">{option1Percent}%</span>
            )}
          </div>
        </button>

        <button
          onClick={() => !userVote && onVote(2)}
          disabled={!!userVote}
          className={`relative w-full px-4 py-3 rounded-xl overflow-hidden transition-all ${
            userVote === 2
              ? 'ring-2 ring-[var(--text-secondary)]'
              : userVote
                ? 'opacity-70'
                : 'hover:scale-[1.02]'
          }`}
        >
          {/* Background bar */}
          {showResults && (
            <div
              className="absolute inset-0 bg-[var(--bg-tertiary)] transition-all duration-500"
              style={{ width: `${option2Percent}%` }}
            />
          )}
          <div className="relative flex items-center justify-between">
            <span className="font-medium text-[var(--text-primary)]">{poll.option_2}</span>
            {showResults && (
              <span className="font-semibold text-[var(--text-primary)]">{option2Percent}%</span>
            )}
          </div>
        </button>
      </div>

      {/* Vote count */}
      {showResults && (
        <p className="text-center text-sm text-[var(--text-muted)] mt-2">
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </p>
      )}
    </div>
  )
}
