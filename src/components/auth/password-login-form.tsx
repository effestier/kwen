'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPassword, sendOTP, verifyOTP, hasCompletedSignup } from '@/services/auth';
import { BRAND } from '@/lib/brand/config';

type SubStep = 'credentials' | 'otp-email' | 'otp-verify';

export function PasswordLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [subStep, setSubStep] = useState<SubStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const submittingRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Password login
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      const result = await signInWithPassword(email, password);

      if (result.error) {
        setError(result.error);
        return;
      }

      // If account exists but registration never finished (password set but no real profile),
      // redirect to signup completion — keep the session so they can complete their profile
      const completedSignup = await hasCompletedSignup();
      if (!completedSignup) {
        router.push('/auth/register?incomplete=true');
        return;
      }

      // M25: Respect redirect param from URL — only allow safe internal paths
      const redirect = searchParams.get('redirect');
      const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/\\') ? redirect : '/feed';
      router.push(safeRedirect);
      router.refresh();
    } catch {
      setError('Could not connect. Check your internet and try again.');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // Resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [resendCooldown]);

  // OTP: send code
  const handleOtpEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);

    try {
      const result = await sendOTP(email);

      if (result.error) {
        setError(result.error);
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      setSubStep('otp-verify');
      setResendCooldown(60);
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

  // OTP: verify code
  const handleOtpVerify = async (e: React.FormEvent) => {
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

      // Security: check if user completed registration (has real profile, not temp/__incomplete_)
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single();
        if (!profile || profile.username.startsWith('__incomplete_')) {
          // Account exists but registration never finished — redirect to complete it
          // Keep the session so they can complete their profile
          router.push('/auth/register?incomplete=true');
          return;
        }
      }

      // M25: Respect redirect param from URL — only allow safe internal paths
      const redirect = searchParams.get('redirect');
      const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/\\') ? redirect : '/feed';
      router.push(safeRedirect);
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
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }, 200);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Shared layout wrapper
  const renderLayout = (children: React.ReactNode, backAction?: () => void) => (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      <header className="p-6 pt-[max(1.5rem,env(safe-area-inset-top))]" />

      <main id="main-content" className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-[380px]">
          <div className="flex items-center justify-center gap-2.5 mb-6">
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

  // Credentials step
  if (subStep === 'credentials') {
    return renderLayout(
      <>
        <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-6">
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Welcome back</h1>
          <p className="text-sm text-[var(--text-muted)] mb-6">Sign in to your account</p>

          {error && (
            <div role="alert" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">
              {error}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-5">
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
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] text-[var(--text-primary)]"
              />
            </div>

            <div className="relative">
              <label htmlFor="password-input" className="sr-only">Password</label>
              <input
                id="password-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] text-[var(--text-primary)]"
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

            <div className="text-right">
              <Link href="/auth/reset-password" className="text-sm text-[var(--accent-primary)]">
                Forgot password?
              </Link>
            </div>


            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setSubStep('otp-email'); setError(null); setOtpCode(''); }}
              className="text-sm text-[var(--accent-primary)]"
            >
              Sign in with code instead
            </button>
          </div>
        </div>

        <p className="text-center mt-6 text-sm text-[var(--text-muted)]">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-[var(--accent-primary)]">Sign up</Link>
        </p>
      </>
    );
  }

  // OTP email step
  if (subStep === 'otp-email') {
    return renderLayout(
      <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Sign in with code</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">We&apos;ll send a 6-digit code to your email</p>

        {error && (
          <div role="alert" aria-live="polite" className="mb-4 p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 text-sm text-[var(--destructive)]">
            {error}
          </div>
        )}

        <form onSubmit={handleOtpEmailSubmit} className="space-y-5">
          <div>
            <label htmlFor="otp-email-input" className="sr-only">Email address</label>
            <input
              id="otp-email-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] text-[var(--text-primary)]"
            />
          </div>


          <button
            type="submit"
            disabled={loading || !email}
            className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send code'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setSubStep('credentials'); setError(null);  }}
            className="text-sm text-[var(--accent-primary)]"
          >
            Use password instead
          </button>
        </div>
      </div>,
      () => { setSubStep('credentials'); setError(null);  }
    );
  }

  // OTP verify step
  if (subStep === 'otp-verify') {
    return renderLayout(
      <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-6">
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

        <form id="otp-form" onSubmit={handleOtpVerify} className="space-y-6">
          <fieldset>
            <legend className="sr-only">Enter 6-digit verification code</legend>
            <div className="flex justify-center gap-1.5" role="group" aria-label="Verification code">
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
                  className="w-10 h-12 text-center text-lg font-bold rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)] text-[var(--text-primary)]"
                />
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={loading || otpCode.length !== 6}
            className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            {resendCooldown > 0 ? (
              <>Resend code in {resendCooldown}s</>
            ) : (
              <>
                Didn&apos;t receive code?{' '}
                <button
                  onClick={() => { setSubStep('otp-email'); setError(null); setOtpCode('');  }}
                  className="text-[var(--accent-primary)]"
                >
                  Resend
                </button>
              </>
            )}
          </p>
        </div>
      </div>,
      () => { setSubStep('otp-email'); setError(null); setOtpCode('');  }
    );
  }

  return null;
}
