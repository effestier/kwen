// Server actions removed — auth functions moved to services/auth.ts (client-side)
// This file is kept for reference but no longer imported

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { checkRateLimit, OTP_SEND_LIMIT, OTP_VERIFY_LIMIT, type RateLimitConfig } from '@/lib/rate-limit';

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

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  hostname?: string;
  action?: string;
}

// One-time-use token cache to prevent replay attacks
const usedTokens = new Map<string, number>();
const TOKEN_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup expired tokens every minute
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of usedTokens) {
    if (now > expiry) usedTokens.delete(token);
  }
}, 60 * 1000);

function markTokenUsed(token: string): void {
  usedTokens.set(token, Date.now() + TOKEN_TTL);
}

function isTokenUsed(token: string): boolean {
  const expiry = usedTokens.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    usedTokens.delete(token);
    return false;
  }
  return true;
}

async function verifyTurnstileToken(token: string): Promise<{ valid: boolean; degraded: boolean }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // No secret key configured — fail closed to prevent abuse
  if (!secretKey) {
    console.error('TURNSTILE_SECRET_KEY is not set — rejecting request');
    return { valid: false, degraded: false };
  }

  // Reject already-used tokens (replay protection)
  if (isTokenUsed(token)) {
    return { valid: false, degraded: false };
  }

  // Native app bypass — skip Cloudflare verification
  if (token === 'native-app-bypass') {
    return { valid: true, degraded: false };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: secretKey, response: token }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    const data: TurnstileResponse = await response.json();

    if (data.success !== true) {
      return { valid: false, degraded: false };
    }

    // Validate hostname matches our domain
    const expectedHostname = process.env.TURNSTILE_HOSTNAME || 'kwen.in';
    if (data.hostname && data.hostname !== expectedHostname) {
      console.error(`Turnstile hostname mismatch: expected ${expectedHostname}, got ${data.hostname}`);
      return { valid: false, degraded: false };
    }

    // Validate action matches what the widget sends
    if (data.action && data.action !== 'auth') {
      console.error(`Turnstile action mismatch: expected auth, got ${data.action}`);
      return { valid: false, degraded: false };
    }

    // Mark token as used (one-time)
    markTokenUsed(token);

    return { valid: true, degraded: false };
  } catch (error) {
    // Network error or timeout — degrade gracefully
    // Allow the request but flag it so rate limiting can be stricter
    console.error('Turnstile verification failed (network error):', error);
    return { valid: true, degraded: true };
  }
}

// Degraded mode: stricter limit when Turnstile can't be verified
const OTP_SEND_LIMIT_DEGRADED: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 1,       // only 1 OTP per minute when degraded
};

const PASSWORD_LOGIN_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 5,
};

const PASSWORD_RESET_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxAttempts: 3,
};

function isStrongPassword(pw: string): { valid: boolean; error?: string } {
  if (pw.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
  if (pw.length > 128) return { valid: false, error: 'Password is too long' };
  if (!/[a-zA-Z]/.test(pw)) return { valid: false, error: 'Password must contain at least one letter' };
  if (!/[0-9]/.test(pw)) return { valid: false, error: 'Password must contain at least one number' };
  return { valid: true };
}

export async function sendOTP(email: string, turnstileToken: string): Promise<AuthResult> {
  try {
    const cleanEmail = sanitizeEmail(email);

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return { error: 'Please enter a valid email address' };
    }

    // Verify Turnstile token before rate limiting
    if (!turnstileToken) {
      return { error: 'Security check required. Please complete the challenge.' };
    }
    const turnstileResult = await verifyTurnstileToken(turnstileToken);
    if (!turnstileResult.valid) {
      return { error: 'Security check failed. Please try again.' };
    }

    // Use stricter rate limit when Turnstile verification is degraded
    const rateConfig = turnstileResult.degraded ? OTP_SEND_LIMIT_DEGRADED : OTP_SEND_LIMIT;
    const limit = await checkRateLimit(`otp-send:${cleanEmail}`, rateConfig);
    if (!limit.allowed) {
      const seconds = Math.ceil((limit.retryAfterMs || 0) / 1000);
      return { error: `Too many requests. Try again in ${seconds}s.` };
    }

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: '',
      },
    });

    if (error) {
      if (error.message?.toLowerCase().includes('rate limit')) {
        return { error: 'Too many requests. Please wait a moment and try again.' };
      }
      // Don't leak whether email exists
      return { success: true };
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

    // Rate limit: 10 verification attempts per 15 min per email
    const limit = await checkRateLimit(`otp-verify:${cleanEmail}`, OTP_VERIFY_LIMIT);
    if (!limit.allowed) {
      const minutes = Math.ceil((limit.retryAfterMs || 0) / 60000);
      return { error: `Too many attempts. Try again in ${minutes} minute(s).` };
    }

    const supabase = await createClient();

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
      const tempUsername = `user_${data.user.id.replace(/-/g, '').slice(0, 8)}`;

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

    revalidatePath('/', 'layout');
    return { success: true };
  } catch {
    return { error: 'Verification failed. Please try again.' };
  }
}

export async function checkUserExists(_email: string): Promise<{ exists: boolean; isNewUser: boolean }> {
  // Always return true to prevent account enumeration
  return { exists: true, isNewUser: false };
}

export async function signOut() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { error: 'Sign out failed' };
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch {
    return { error: 'Sign out failed' };
  }
}

export async function getSession() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return { session: null, error: 'Session unavailable' };
    }

    return { session: data.session, error: null };
  } catch {
    return { session: null, error: 'Session unavailable' };
  }
}

export async function getUser() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      return { user: null, error: 'Authentication failed' };
    }

    return { user, error: null };
  } catch {
    return { user: null, error: 'Authentication failed' };
  }
}

const RESERVED_USERNAMES = new Set([
  'admin', 'support', 'help', 'info', 'team', 'staff', 'mod', 'moderator',
  'system', 'official', 'kwen', 'kwenin', 'root', 'superuser', 'api',
  'about', 'auth', 'login', 'register', 'feed', 'explore', 'messages',
  'notifications', 'settings', 'profile', 'search', 'stories', 'reels',
  'privacy', 'terms', 'legal', 'report', 'safety', 'security',
]);

export async function completeProfile(username: string, displayName: string): Promise<AuthResult> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error('[completeProfile] createClient failed:', err);
    return { error: 'Server error. Please try again.' };
  }

  let user;
  try {
    const { data: { user: u }, error: authError } = await supabase.auth.getUser();
    if (authError || !u) {
      return { error: 'Not authenticated. Please log in again.' };
    }
    user = u;
  } catch (err) {
    console.error('[completeProfile] getUser threw:', err);
    return { error: 'Auth check failed. Please try again.' };
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
    console.error('[completeProfile] Username lookup error:', lookupError);
    return { error: 'Could not verify username availability. Please try again.' };
  }

  if (existing) {
    return { error: 'Username is already taken' };
  }

  // Try UPDATE first (profile likely exists from trigger)
  const { data: updateData, error: updateError, count } = await supabase
    .from('profiles')
    .update({
      username: cleanUsername,
      display_name: cleanDisplayName,
    })
    .eq('id', user.id)
    .select();

  if (updateError) {
    console.error('[completeProfile] UPDATE failed:', JSON.stringify(updateError));
    if (updateError.code === '23505') {
      return { error: 'Username is already taken' };
    }
    return { error: 'Failed to save profile. Please try again.' };
  }

  // If UPDATE returned no rows, profile doesn't exist yet — INSERT it
  if (!updateData || updateData.length === 0) {
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        username: cleanUsername,
        display_name: cleanDisplayName,
      });

    if (insertError) {
      console.error('[completeProfile] INSERT failed:', JSON.stringify(insertError));
      if (insertError.code === '23505') {
        // Race condition: trigger created profile between UPDATE and INSERT
        // Retry the UPDATE
        const { error: retryError } = await supabase
          .from('profiles')
          .update({ username: cleanUsername, display_name: cleanDisplayName })
          .eq('id', user.id);

        if (retryError) {
          console.error('[completeProfile] Retry UPDATE failed:', JSON.stringify(retryError));
          return { error: 'Failed to save profile. Please try again.' };
        }
      } else {
        return { error: 'Failed to save profile. Please try again.' };
      }
    }
  }

  // Revalidate (non-fatal — profile is already saved)
  try {
    revalidatePath('/', 'layout');
  } catch (err) {
    console.error('[completeProfile] revalidatePath failed (non-fatal):', err);
  }

  return { success: true };
}

// =============================================
// PASSWORD AUTH
// =============================================

export async function signInWithPassword(email: string, password: string, turnstileToken: string): Promise<AuthResult> {
  try {
    const cleanEmail = sanitizeEmail(email);

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return { error: 'Please enter a valid email address' };
    }

    if (!password) {
      return { error: 'Please enter your password' };
    }

    if (!turnstileToken) {
      return { error: 'Security check required. Please complete the challenge.' };
    }

    const turnstileResult = await verifyTurnstileToken(turnstileToken);
    if (!turnstileResult.valid) {
      return { error: 'Security check failed. Please try again.' };
    }

    const limit = await checkRateLimit(`password-login:${cleanEmail}`, PASSWORD_LOGIN_LIMIT);
    if (!limit.allowed) {
      const minutes = Math.ceil((limit.retryAfterMs || 0) / 60000);
      return { error: `Too many login attempts. Try again in ${minutes} minute(s).` };
    }

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      // Generic message — don't reveal whether email exists or password is wrong
      return { error: 'Invalid email or password. Please try again.' };
    }

    revalidatePath('/', 'layout');
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

    const supabase = await createClient();
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

export async function sendPasswordReset(email: string, turnstileToken: string): Promise<AuthResult> {
  try {
    const cleanEmail = sanitizeEmail(email);

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return { error: 'Please enter a valid email address' };
    }

    if (!turnstileToken) {
      return { error: 'Security check required. Please complete the challenge.' };
    }

    const turnstileResult = await verifyTurnstileToken(turnstileToken);
    if (!turnstileResult.valid) {
      return { error: 'Security check failed. Please try again.' };
    }

    const limit = await checkRateLimit(`reset-pw:${cleanEmail}`, PASSWORD_RESET_LIMIT);
    if (!limit.allowed) {
      const minutes = Math.ceil((limit.retryAfterMs || 0) / 60000);
      return { error: `Too many reset requests. Try again in ${minutes} minute(s).` };
    }

    const supabase = await createClient();

    await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: 'https://kwen.in/auth/reset-password',
    });

    // Always return success — do not leak whether email exists
    return { success: true };
  } catch {
    // Always return success — do not leak whether email exists
    return { success: true };
  }
}

export async function verifyRecoveryToken(tokenHash: string): Promise<AuthResult> {
  try {
    if (!tokenHash || typeof tokenHash !== 'string') {
      return { error: 'Invalid reset link' };
    }

    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    });

    if (error) {
      return { error: 'Invalid or expired reset link. Please request a new one.' };
    }

    return { success: true };
  } catch {
    return { error: 'Invalid or expired reset link. Please request a new one.' };
  }
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
  try {
    const strength = isStrongPassword(newPassword);
    if (!strength.valid) {
      return { error: strength.error! };
    }

    const supabase = await createClient();
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
