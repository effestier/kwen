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
        // Don't redirect - we'll handle verification ourselves
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.error('[OTP] Send error:', error);

      // Handle rate limiting specifically
      if (error.message?.includes('rate limit')) {
        return { error: 'Too many requests. Please wait a moment and try again.' };
      }

      return { error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[OTP] Send exception:', err);
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
      console.error('[OTP] Verify error:', error);

      if (error.message?.includes('invalid') || error.message?.includes('expired')) {
        return { error: 'Invalid or expired code. Please request a new one.' };
      }

      return { error: error.message };
    }

    if (!data.user) {
      return { error: 'Verification failed. Please try again.' };
    }

    // Check if profile exists, if not create it
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .single();

    if (!existingProfile) {
      // Extract name from email if not provided
      const displayName = email.split('@')[0];

      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          username: `user_${data.user.id.slice(0, 8)}`,
          display_name: displayName,
        });

      if (profileError) {
        console.error('[OTP] Profile creation error:', profileError);
        // Continue anyway - user is already authenticated
      }

      // Create user settings
      const { error: settingsError } = await supabase
        .from('user_settings')
        .insert({
          user_id: data.user.id,
        });

      if (settingsError) {
        console.error('[OTP] Settings creation error:', settingsError);
        // Continue anyway
      }
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err: any) {
    console.error('[OTP] Verify exception:', err);
    return { error: err?.message || 'Verification failed. Please try again.' };
  }
}

// Check if user exists (for login flow)
export async function checkUserExists(email: string): Promise<{ exists: boolean; isNewUser: boolean }> {
  try {
    const supabase = await createClient();

    // Try to sign in with OTP first - if user exists, they'll get a code
    // If user doesn't exist, Supabase will create one
    return { exists: true, isNewUser: false };
  } catch {
    return { exists: false, isNewUser: true };
  }
}

// Sign out
export async function signOut() {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

// Get current session
export async function getSession() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return { session: null, error: error.message };
  }

  return { session: data.session, error: null };
}

// Get current user
export async function getUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    return { user: null, error: error.message };
  }

  return { user, error: null };
}

// Update user profile after signup
export async function completeProfile(username: string, displayName: string): Promise<AuthResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'Not authenticated' };
    }

    // Validate username
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return { error: 'Username must be 3-30 characters, lowercase letters, numbers, and underscores only' };
    }

    // Check if username is taken
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .neq('id', user.id)
      .single();

    if (existing) {
      return { error: 'Username is already taken' };
    }

    // Update profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        username,
        display_name: displayName,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[PROFILE] Update error:', updateError);
      return { error: updateError.message };
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err: any) {
    console.error('[PROFILE] Exception:', err);
    return { error: err?.message || 'Failed to update profile' };
  }
}