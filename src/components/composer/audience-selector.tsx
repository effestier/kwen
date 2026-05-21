'use client'

interface AudienceSelectorProps {
  value: 'public' | 'followers' | 'private'
  onChange: (value: 'public' | 'followers' | 'private') => void
}

const options = [
  {
    value: 'public' as const,
    label: 'Public',
    description: 'Anyone can see this post',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
      </svg>
    ),
  },
  {
    value: 'followers' as const,
    label: 'Followers',
    description: 'Only your followers can see this',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    value: 'private' as const,
    label: 'Only me',
    description: 'Only you can see this post',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
]

export function AudienceSelector({ value, onChange }: AudienceSelectorProps) {
  return (
    <div className="space-y-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
            value === opt.value ? 'bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]' : 'hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <div className={`${value === opt.value ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}`}>
            {opt.icon}
          </div>
          <div className="text-left">
            <p className={`text-sm font-medium ${value === opt.value ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'}`}>
              {opt.label}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{opt.description}</p>
          </div>
          {value === opt.value && (
            <div className="ml-auto w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
