'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/design-system/skeleton'
import { createClient } from '@/lib/supabase/client'
import { getCloseFriends, addCloseFriend, removeCloseFriend } from '@/services/close-friends'
import type { CloseFriend } from '@/services/close-friends'

interface User {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
}

export default function CloseFriendsPage() {
  const [closeFriends, setCloseFriends] = useState<CloseFriend[]>([])
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const supabase = createClient()

  // Load close friends
  useEffect(() => {
    async function load() {
      const friends = await getCloseFriends()
      setCloseFriends(friends)
      setLoading(false)
    }
    load()
  }, [])

  // Search for users
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const searchTimeout = setTimeout(async () => {
      setSearching(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .neq('id', user.id)
        .limit(10)

      setSearchResults(data || [])
      setSearching(false)
    }, 300)

    return () => clearTimeout(searchTimeout)
  }, [searchQuery])

  const handleAdd = async (userId: string) => {
    setAdding(userId)

    const result = await addCloseFriend(userId)

    if (result.success) {
      // Reload close friends
      const friends = await getCloseFriends()
      setCloseFriends(friends)
      setSearchQuery('')
      setSearchResults([])
    }

    setAdding(null)
  }

  const handleRemove = async (userId: string) => {
    setRemoving(userId)

    const result = await removeCloseFriend(userId)

    if (result.success) {
      setCloseFriends(closeFriends.filter(f => f.friend_id !== userId))
    }

    setRemoving(null)
  }

  const isCloseFriend = (userId: string) => {
    return closeFriends.some(f => f.friend_id === userId)
  }

  return (
    <MainLayout>
      <div className="min-h-screen">
        {/* Header */}
        <div className="sticky top-12 lg:top-0 z-10 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 py-3">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Close Friends</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Share stories exclusively with your close friends
          </p>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[var(--border-subtle)]">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users to add..."
              className="w-full px-4 py-2 pl-10 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        </div>

        {/* Search results */}
        {searchQuery && (
          <div className="border-b border-[var(--border-subtle)]">
            {searching ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton variant="circular" width={40} height={40} />
                    <div className="flex-1 space-y-1">
                      <Skeleton variant="text" width="40%" />
                      <Skeleton variant="text" width="30%" />
                    </div>
                  </div>
                ))}
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-4 hover:bg-[var(--bg-secondary)]"
                >
                  <Avatar src={user.avatar_url} name={user.display_name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--text-primary)] font-medium truncate">
                      {user.display_name}
                    </p>
                    <p className="text-[var(--text-muted)] text-sm truncate">
                      @{user.username}
                    </p>
                  </div>
                  {isCloseFriend(user.id) ? (
                    <button
                      onClick={() => handleRemove(user.id)}
                      disabled={removing === user.id}
                      className="px-4 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-sm hover:bg-[var(--bg-secondary)]"
                    >
                      {removing === user.id ? '...' : 'Remove'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAdd(user.id)}
                      disabled={adding === user.id}
                      className="px-4 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {adding === user.id ? '...' : 'Add'}
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-[var(--text-muted)]">
                No users found
              </div>
            )}
          </div>
        )}

        {/* Close friends list */}
        <div>
          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Your Close Friends ({closeFriends.length})
            </h2>
          </div>

          {loading ? (
            <div className="space-y-3 px-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton variant="circular" width={40} height={40} />
                  <div className="flex-1 space-y-1">
                    <Skeleton variant="text" width="40%" />
                    <Skeleton variant="text" width="30%" />
                  </div>
                </div>
              ))}
            </div>
          ) : closeFriends.length > 0 ? (
            closeFriends.map((friend) => (
              <div
                key={friend.friend_id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)]"
              >
                <Avatar src={friend.avatar_url} name={friend.display_name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--text-primary)] font-medium truncate">
                    {friend.display_name}
                  </p>
                  <p className="text-[var(--text-muted)] text-sm truncate">
                    @{friend.username}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(friend.friend_id)}
                  disabled={removing === friend.friend_id}
                  className="px-4 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-sm hover:bg-[var(--bg-secondary)]"
                >
                  {removing === friend.friend_id ? '...' : 'Remove'}
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-8 px-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-4 text-[var(--text-muted)]"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p className="text-[var(--text-muted)]">
                No close friends yet
              </p>
              <p className="text-[var(--text-muted)] text-sm mt-1">
                Search and add users to your close friends list
              </p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
