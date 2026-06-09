// Client-side auth functions for both web and native (Capacitor) builds
// Uses browser Supabase client — no server actions, no cookies(), no server-only deps

import { createClient } from '@/lib/supabase/client';
import { isNativePlatform } from '@/lib/platform';

export interface AuthResult {
  success?: boolean;
  error?: string;
}

function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(pw: string): { valid: boolean; error?: string } {
  if (pw.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
  if (pw.length > 128) return { valid: false, error: 'Password is too long' };
  if (!/[a-zA-Z]/.test(pw)) return { valid: false, error: 'Password must contain at least one letter' };
  if (!/[0-9]/.test(pw)) return { valid: false, error: 'Password must contain at least one number' };
  return { valid: true };
}

const RESERVED_USERNAMES = new Set([
  'admin', 'support', 'help', 'info', 'team', 'staff', 'mod', 'moderator',
  'system', 'official', 'kwen', 'kwenin', 'root', 'superuser', 'api',
  'about', 'auth', 'login', 'register', 'feed', 'explore', 'messages',
  'notifications', 'settings', 'profile', 'search', 'stories', 'reels',
  'privacy', 'terms', 'legal', 'report', 'safety', 'security',
]);

export async function sendOTP(email: string): Promise<AuthResult> {
  try {
    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return { error: 'Please enter a valid email address' };
    }

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'https://kwen.in/auth/callback',
      },
    });

    if (error) {
      if (error.message?.toLowerCase().includes('rate limit')) {
        return { error: 'Too many requests. Please wait a moment and try again.' };
      }
      // L13: Return actual error instead of silently swallowing
      return { error: 'Failed to send code. Please try again.' };
    }

    return { success: true };
  } catch {
    return { error: 'Failed to send code. Please try again.' };
  }
}

export async function verifyOTP(email: string, token: string): Promise<AuthResult> {
  try {
    const cleanEmail = sanitizeEmail(email);
    const cleanToken = token.trim();

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return { error: 'Invalid email' };
    }
    if (!cleanToken || cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) {
      return { error: 'Please enter the 6-digit code' };
    }

    const supabase = createClient();

    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
    });

    if (error) {
      if (error.message?.toLowerCase().includes('invalid') || error.message?.toLowerCase().includes('expired')) {
        return { error: 'Invalid or expired code. Please request a new one.' };
      }
      return { error: 'Verification failed. Please try again.' };
    }

    if (!data.user) {
      return { error: 'Verification failed. Please try again.' };
    }

    // Ensure profile exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .single();

    if (!existingProfile) {
      const displayName = cleanEmail.split('@')[0].slice(0, 50);
      const tempUsername = `__incomplete_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        username: tempUsername,
        display_name: displayName,
      }, { onConflict: 'id' });

      if (profileError) {
        console.error('[verifyOTP] Profile creation error:', profileError);
      }

      const { error: settingsError } = await supabase.from('user_settings').upsert({
        user_id: data.user.id,
      }, { onConflict: 'user_id' });

      if (settingsError) {
        console.error('[verifyOTP] Settings creation error:', settingsError);
      }
    }

    return { success: true };
  } catch {
    return { error: 'Verification failed. Please try again.' };
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  try {
    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return { error: 'Please enter a valid email address' };
    }
    if (!password) {
      return { error: 'Please enter your password' };
    }

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      // Distinguish network/TLS failures from actual auth failures
      const err = error as Error & { status?: number };
      if (!err.status || err.status === 0) {
        return { error: 'Could not connect. Check your internet and try again.' };
      }
      // Generic message — don't reveal whether email exists or password is wrong
      return { error: 'Invalid email or password. Please try again.' };
    }

    return { success: true };
  } catch {
    return { error: 'Could not connect. Check your internet and try again.' };
  }
}

export async function setPassword(password: string): Promise<AuthResult> {
  try {
    const strength = isStrongPassword(password);
    if (!strength.valid) {
      return { error: strength.error! };
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Not authenticated. Please log in again.' };
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('new password should be different')) {
        return { error: 'Please choose a different password.' };
      }
      return { error: 'Failed to set password. Please try again.' };
    }

    return { success: true };
  } catch {
    return { error: 'Failed to set password. Please try again.' };
  }
}

export async function completeProfile(username: string, displayName: string): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Not authenticated. Please log in again.' };
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim().slice(0, 100);

    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      return { error: 'Username must be 3-30 characters, lowercase letters, numbers, and underscores only' };
    }
    if (!cleanDisplayName) {
      return { error: 'Display name is required' };
    }
    if (RESERVED_USERNAMES.has(cleanUsername)) {
      return { error: 'This username is reserved' };
    }

    // Check if username is taken by ANOTHER user
    const { data: existing, error: lookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .neq('id', user.id)
      .maybeSingle();

    if (lookupError) {
      return { error: 'Could not verify username availability. Please try again.' };
    }
    if (existing) {
      return { error: 'Username is already taken' };
    }

    // Try UPDATE first (profile likely exists from trigger)
    const { data: updateData, error: updateError } = await supabase
      .from('profiles')
      .update({ username: cleanUsername, display_name: cleanDisplayName })
      .eq('id', user.id)
      .select();

    if (updateError) {
      if (updateError.code === '23505') {
        return { error: 'Username is already taken' };
      }
      return { error: 'Failed to save profile. Please try again.' };
    }

    // If UPDATE returned no rows, profile doesn't exist yet — INSERT it
    if (!updateData || updateData.length === 0) {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ id: user.id, username: cleanUsername, display_name: cleanDisplayName });

      if (insertError) {
        if (insertError.code === '23505') {
          // Race condition: retry UPDATE
          const { error: retryError } = await supabase
            .from('profiles')
            .update({ username: cleanUsername, display_name: cleanDisplayName })
            .eq('id', user.id);
          if (retryError) {
            return { error: 'Failed to save profile. Please try again.' };
          }
        } else {
          return { error: 'Failed to save profile. Please try again.' };
        }
      }
    }

    return { success: true };
  } catch {
    return { error: 'Failed to save profile. Please try again.' };
  }
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  try {
    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return { error: 'Please enter a valid email address' };
    }

    const supabase = createClient();

    // Server-side rate limiting via Supabase RPC (3 per 15 min per email)
    const { data: rateLimitResult } = await supabase.rpc('check_rate_limit', {
      p_key: `password-reset:${cleanEmail}`,
      p_max_attempts: 3,
      p_window_ms: 15 * 60 * 1000,
    });

    if (rateLimitResult && !rateLimitResult.allowed) {
      // Still return success — don't leak rate limit info
      return { success: true };
    }

    // M26: Use dynamic origin instead of hardcoded URL
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://kwen.in';
    await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${origin}/auth/reset-password`,
    });

    // Always return success — do not leak whether email exists
    return { success: true };
  } catch {
    return { success: true };
  }
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
  try {
    const strength = isStrongPassword(newPassword);
    if (!strength.valid) {
      return { error: strength.error! };
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
      return { error: 'Not authenticated. Please log in again.' };
    }

    // Re-authenticate with current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      return { error: 'Current password is incorrect.' };
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      return { error: 'Failed to update password. Please try again.' };
    }

    return { success: true };
  } catch {
    return { error: 'Failed to update password. Please try again.' };
  }
}

// Profile completeness check — used to block login for half-created accounts
export async function hasCompletedSignup(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    // Account is complete only if a profile with a real username exists (not __incomplete_ temp)
    return !!profile?.username && !profile.username.startsWith('__incomplete_');
  } catch {
    return false;
  }
}

// Client-side read operations and sign out

export async function signOut() {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) return { error: 'Sign out failed' };
    return { success: true };
  } catch {
    return { error: 'Sign out failed' };
  }
}

export async function getSession() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) return { session: null, error: 'Session unavailable' };
    return { session: data.session, error: null };
  } catch {
    return { session: null, error: 'Session unavailable' };
  }
}

export async function getUser() {
  try {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return { user: null, error: 'Authentication failed' };
    return { user, error: null };
  } catch {
    return { user: null, error: 'Authentication failed' };
  }
}

export async function verifyRecoveryToken(tokenHash: string): Promise<AuthResult> {
  try {
    if (!tokenHash || typeof tokenHash !== 'string') {
      return { error: 'Invalid reset link' };
    }
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    });
    if (error) return { error: 'Invalid or expired reset link. Please request a new one.' };
    return { success: true };
  } catch {
    return { error: 'Invalid or expired reset link. Please request a new one.' };
  }
}
