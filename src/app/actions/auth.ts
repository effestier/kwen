'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function signUp(formData: FormData) {
  try {
    const supabase = await createClient()

    const email = (formData.get('email') as string)?.trim().toLowerCase().slice(0, 254)
    const password = formData.get('password') as string
    const username = (formData.get('username') as string)?.trim().toLowerCase()
    const displayName = (formData.get('displayName') as string)?.trim().slice(0, 100)

    if (!email || !password || !username || !displayName) {
      return { error: 'All fields are required' }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: 'Please enter a valid email address' }
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return { error: 'Username must be 3-30 characters, lowercase letters, numbers, and underscores only' }
    }

    if (password.length < 8) {
      return { error: 'Password must be at least 8 characters' }
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/callback`,
      },
    })

    if (error) {
      return { error: 'Sign up failed. Please try again.' }
    }

    revalidatePath('/', 'layout')
    return { success: true }
  } catch {
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

export async function signIn(formData: FormData) {
  try {
    const supabase = await createClient()

    const email = (formData.get('email') as string)?.trim().toLowerCase()
    const password = formData.get('password') as string

    if (!email || !password) {
      return { error: 'Email and password are required' }
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return { error: 'Invalid email or password' }
    }

    revalidatePath('/', 'layout')
    return { success: true }
  } catch {
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

export async function signOut() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      return { error: 'Sign out failed' }
    }

    revalidatePath('/', 'layout')
    redirect('/')
  } catch {
    return { error: 'Sign out failed' }
  }
}

export async function getSession() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      return { session: null, error: 'Session unavailable' }
    }

    return { session: data.session, error: null }
  } catch {
    return { session: null, error: 'Session unavailable' }
  }
}

export async function getUser() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      return { user: null, error: 'Authentication failed' }
    }

    return { user, error: null }
  } catch {
    return { user: null, error: 'Authentication failed' }
  }
}

export async function resetPassword(email: string) {
  try {
    const supabase = await createClient()
    const cleanEmail = email?.trim().toLowerCase()

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { error: 'Please enter a valid email address' }
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/reset-password`,
    })

    if (error) {
      return { error: 'Failed to send reset email' }
    }

    return { success: true }
  } catch {
    return { error: 'Failed to send reset email' }
  }
}

export async function updatePassword(newPassword: string) {
  try {
    const supabase = await createClient()

    if (!newPassword || newPassword.length < 8) {
      return { error: 'Password must be at least 8 characters' }
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      return { error: 'Failed to update password' }
    }

    return { success: true }
  } catch {
    return { error: 'Failed to update password' }
  }
}
