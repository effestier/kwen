'use client'

import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { useEffect, useState, useRef } from 'react'

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
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

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

    let initialHandled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        initialHandled = true
        if (session?.user) {
          try {
            const profile = await fetchProfile(session.user.id)
            setState({ user: session.user, loading: false, profile })
          } catch {
            // Profile fetch failed — still set user so app doesn't hang
            setState({ user: session.user, loading: false, profile: null })
          }
        } else {
          setState({ user: null, loading: false, profile: null })
        }
      }
    )

    // Fallback: if onAuthStateChange doesn't fire within 3s
    const fallbackTimer = setTimeout(async () => {
      if (initialHandled) return
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const profile = await fetchProfile(user.id)
          setState({ user, loading: false, profile })
        } else {
          setState(prev => ({ ...prev, loading: false }))
        }
      } catch {
        setState(prev => ({ ...prev, loading: false }))
      }
    }, 3000)

    return () => {
      clearTimeout(fallbackTimer)
      subscription.unsubscribe()
    }
  }, [])

  return state
}