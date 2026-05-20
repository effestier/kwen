'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { sendOTP, verifyOTP, setPassword, completeProfile } from '@/services/auth';
import { BRAND } from '@/lib/brand/config';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import { isNativePlatform } from '@/lib/platform';

type Step = 'email' | 'otp' | 'complete';

export function RegisterForm() {
  const router = useRouter();
  const isNative = isNativePlatform();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(isNative ? 'native-app-bypass' : null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const submittingRef = useRef(false);

  // Step 1: Send OTP
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!turnstileToken) {
      setError('Security check required. Please complete the challenge.');
      return;
    }

    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      const result = await sendOTP(email, turnstileToken);

      if (result.error) {
        setError(result.error);
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      setStep('otp');
      setTurnstileToken(isNative ? 'native-app-bypass' : null);
      setSuccessMessage('Code sent! Check your email.');
      setTimeout(() => setSuccessMessage(null), 3000);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError('Could not connect. Check your internet and try again.');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // Step 2: Verify OTP
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      const result = await verifyOTP(email, otpCode);

      if (result.error) {
        setError(result.error);
        return;
      }

      setStep('complete');
    } catch {
      setError('Could not connect. Check your internet and try again.');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // Step 3: Complete registration
  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !displayName || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setError('Username must be 3-30 characters, lowercase letters, numbers, and underscores only');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one letter and one number');
      return;
    }

    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      // Set password first
      const pwResult = await setPassword(password);
      if (pwResult.error) {
        setError(pwResult.error);
        return;
      }

      // Then complete profile
      const profileResult = await completeProfile(username, displayName);
      if (profileResult.error) {
        setError(profileResult.error);
        return;
      }

      router.push('/feed');
      router.refresh();
    } catch {
      setError('Could not connect. Check your internet and try again.');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // OTP input handlers
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = otpCode.split('');
    newCode[index] = value.slice(-1);
    setOtpCode(newCode.join(''));
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (newCode.join('').length === 6) {
      setTimeout(() => {
        const form = document.getElementById('otp-form') as HTMLFormElement | null;
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
      }, 200);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Shared layout
  const renderLayout = (children: React.ReactNode, backAction?: () => void) => (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      <header className="p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        {backAction ? (
          <button
            onClick={backAction}
            aria-label="Go back"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors-fast"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
            Back
          </button>
        ) : (
          <Link href="/" aria-label="Back to home" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors-fast">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
            Back
          </Link>
        )}
      </header>

      <main id="main-content" className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="flex items-center justify-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] flex items-center justify-center">
              <span className="text-base font-semibold text-white">{BRAND.logo.symbol}</span>
            </div>
            <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">{BRAND.name}</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );

  // Step 1: Email
  if (step === 'email') {
    return renderLayout(
      <>
        <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-8">
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Create account</h1>
          <p className="text-sm text-[var(--text-muted)] mb-6">Join {BRAND.name} today</p>

          {error && (
            <div role="alert" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-5">
            <div>
              <label htmlFor="email-input" className="sr-only">Email address</label>
              <input
                id="email-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
              />
            </div>

            {!isNative && (
              <TurnstileWidget
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                onError={() => {
                  setTurnstileToken(isNative ? 'native-app-bypass' : null);
                  setError('Security check failed. Please try again.');
                }}
              />
            )}

            <button
              type="submit"
              disabled={loading || !email || !turnstileToken}
              className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Continue'}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-[var(--accent-primary)] hover:underline">Sign in</Link>
        </p>
      </>
    );
  }

  // Step 2: OTP verification
  if (step === 'otp') {
    return renderLayout(
      <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-8">
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Check your email</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          We sent a 6-digit code to<br />
          <span className="text-[var(--text-primary)] font-medium">{email}</span>
        </p>

        {error && (
          <div role="alert" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">
            {error}
          </div>
        )}

        {successMessage && (
          <div role="status" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/20 text-sm text-[var(--success)]">
            {successMessage}
          </div>
        )}

        <form id="otp-form" onSubmit={handleOtpSubmit} className="space-y-6">
          <fieldset>
            <legend className="sr-only">Enter 6-digit verification code</legend>
            <div className="flex justify-center gap-2" role="group" aria-label="Verification code">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={otpCode[i] || ''}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  aria-label={`Digit ${i + 1} of 6`}
                  className="w-12 h-14 text-center text-xl font-bold rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                />
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={loading || otpCode.length !== 6}
            className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Didn&apos;t receive code?{' '}
            <button
              onClick={() => { setStep('email'); setError(null); setOtpCode(''); setTurnstileToken(isNative ? 'native-app-bypass' : null); }}
              className="text-[var(--accent-primary)] hover:underline"
            >
              Go back and resend
            </button>
          </p>
        </div>
      </div>,
      () => { setStep('email'); setError(null); setOtpCode(''); setTurnstileToken(isNative ? 'native-app-bypass' : null); }
    );
  }

  // Step 3: Complete profile + password
  if (step === 'complete') {
    return renderLayout(
      <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-8">
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Complete your profile</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">Set up your profile and password</p>

        {error && (
          <div role="alert" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">
            {error}
          </div>
        )}

        <form onSubmit={handleCompleteSubmit} className="space-y-5">
          <div>
            <label htmlFor="display-name-input" className="sr-only">Display name</label>
            <input
              id="display-name-input"
              type="text"
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label htmlFor="username-input" className="sr-only">Username</label>
            <input
              id="username-input"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
              pattern="^[a-z0-9_]{3,30}$"
              title="3-30 characters, lowercase letters, numbers, and underscores only"
              autoComplete="username"
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
            />
            <p className="text-xs text-[var(--text-muted)] mt-2">This will be your unique URL: /profile/{username || 'username'}</p>
          </div>

          <div className="relative">
            <label htmlFor="password-input" className="sr-only">Password</label>
            <input
              id="password-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password (min 8 chars, 1 letter, 1 number)"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>

          <div>
            <label htmlFor="confirm-password-input" className="sr-only">Confirm password</label>
            <input
              id="confirm-password-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username || !displayName || !password || !confirmPassword}
            className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    );
  }

  return null;
}
