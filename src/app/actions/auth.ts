'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function signUp(formData: FormData) {
  try {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const username = formData.get('username') as string
    const displayName = formData.get('displayName') as string

    // Validate required fields
    if (!email || !password || !username || !displayName) {
      return { error: 'All fields are required' }
    }

    // Validate username format
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return { error: 'Username must be 3-30 characters, lowercase letters, numbers, and underscores only' }
    }

    // Validate password
    if (password.length < 6) {
      return { error: 'Password must be at least 6 characters' }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: displayName,
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/callback`,
      },
    })

    if (error) {
      console.error('Signup error:', error)
      return { error: error.message }
    }

    // Check if user was created (data.user will be null if email confirmation is required)
    // But auth.users row should still be created

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (err) {
    console.error('Signup exception:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

export async function signIn(formData: FormData) {
  try {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    if (!email || !password) {
      return { error: 'Email and password are required' }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error('Signin error:', error)
      return { error: 'Invalid login credentials' }
    }

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (err) {
    console.error('Signin exception:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

export async function signOut() {
  const supabase = await createClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function getSession() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    return { session: null, error: error.message }
  }

  return { session: data.session, error: null }
}

export async function getUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) {
    return { user: null, error: error.message }
  }

  return { user, error: null }
}

export async function resetPassword(email: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/reset-password`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function updatePassword(newPassword: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}