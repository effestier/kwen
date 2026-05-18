'use client'

import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

type AuthState = {
  user: User | null
  loading: boolean
  profile: Profile | null
}

type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  is_verified: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    profile: null,
  })
  const supabase = createClient()

  useEffect(() => {
    const fetchProfile = async (userId: string): Promise<Profile | null> => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, is_verified')
        .eq('id', userId)
        .single()

      if (profile) return profile as Profile

      // Fallback: profile missing for authenticated user - create it
      const tempUsername = `user_${userId.slice(0, 8)}`
      const { data: newProfile } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          username: tempUsername,
          display_name: 'User',
        }, { onConflict: 'id' })
        .select('id, username, display_name, avatar_url, bio, is_verified')
        .single()

      return newProfile as Profile | null
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          setState({
            user: session.user,
            loading: false,
            profile,
          })
        } else {
          setState({
            user: null,
            loading: false,
            profile: null,
          })
        }
      }
    )

    // Initial check
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        fetchProfile(user.id).then((profile) => {
          setState({
            user,
            loading: false,
            profile,
          })
        })
      } else {
        setState((prev) => ({ ...prev, loading: false }))
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return state
}