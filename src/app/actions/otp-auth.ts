'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface AuthResult {
  success?: boolean;
  error?: string;
}

// Send OTP to email
export async function sendOTP(email: string): Promise<AuthResult> {
  try {
    const supabase = await createClient();

    if (!email || !email.includes('@')) {
      return { error: 'Please enter a valid email address' };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: '', // FORCE OTP instead of magic link
      },
    });

    if (error) {

      if (error.message?.toLowerCase().includes('rate limit')) {
        return { error: 'Too many requests. Please wait a moment and try again.' };
      }

      return { error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { error: err?.message || 'Failed to send OTP. Please try again.' };
  }
}

// Verify OTP and create/log in user
export async function verifyOTP(email: string, token: string): Promise<AuthResult> {
  try {
    const supabase = await createClient();

    if (!email || !token) {
      return { error: 'Email and code are required' };
    }

    if (token.length !== 6) {
      return { error: 'Please enter the 6-digit code' };
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {

      if (
        error.message?.toLowerCase().includes('invalid') ||
        error.message?.toLowerCase().includes('expired')
      ) {
        return { error: 'Invalid or expired code. Please request a new one.' };
      }

      return { error: error.message };
    }

    if (!data.user) {
      return { error: 'Verification failed. Please try again.' };
    }

    // Ensure profile exists - use upsert to handle race conditions with trigger
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .single();

    if (!existingProfile) {
      const displayName = email.split('@')[0];
      const tempUsername = `user_${data.user.id.slice(0, 8)}`;

      // Upsert handles race condition with database trigger
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        username: tempUsername,
        display_name: displayName,
      }, { onConflict: 'id' });

      if (profileError) {
      }

      // Create user settings (ignore if already exists)
      const { error: settingsError } = await supabase.from('user_settings').upsert({
        user_id: data.user.id,
      }, { onConflict: 'user_id' });

      if (settingsError) {
      }
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || 'Verification failed. Please try again.' };
  }
}

export async function checkUserExists(email: string): Promise<{ exists: boolean; isNewUser: boolean }> {
  return { exists: true, isNewUser: false };
}

export async function signOut() {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

export async function getSession() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return { session: null, error: error.message };
  }

  return { session: data.session, error: null };
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return { user: null, error: error.message };
  }

  return { user, error: null };
}

export async function completeProfile(username: string, displayName: string): Promise<AuthResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'Not authenticated' };
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return {
        error:
          'Username must be 3-30 characters, lowercase letters, numbers, and underscores only',
      };
    }

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .neq('id', user.id)
      .single();

    if (existing) {
      return { error: 'Username is already taken' };
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        username,
        display_name: displayName,
      })
      .eq('id', user.id);

    if (updateError) {
      return { error: updateError.message };
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || 'Failed to update profile' };
  }
}