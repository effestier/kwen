'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sendOTP, verifyOTP } from '@/app/actions/otp-auth'
import { BRAND } from '@/lib/brand/config'

interface AuthFormProps {
  mode: 'login' | 'register'
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(1)

  // Store form data between steps
  const [formData, setFormData] = useState({
    displayName: '',
    username: '',
    email: '',
    password: '',
  })

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault()
    // Validate step 1 fields
    if (!formData.displayName || !formData.username || !formData.email) {
      setError('Please fill in all fields')
      return
    }
    if (!/^[a-z0-9_]{3,30}$/.test(formData.username)) {
      setError('Username must be 3-30 characters, lowercase letters, numbers, and underscores only')
      return
    }
    setError(null)
    setStep(2)
  }

  const handleRegisterSubmit = async () => {
    if (!formData.password || formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    setError(null)

    const data = new FormData()
    data.set('displayName', formData.displayName)
    data.set('username', formData.username)
    data.set('email', formData.email)
    data.set('password', formData.password)

    const result = await signUp(data)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setError('Check your email to confirm your account.')
    setLoading(false)
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setLoading(true)
    setError(null)

    const data = new FormData()
    data.set('email', formData.email)
    data.set('password', formData.password)

    const result = await signIn(data)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.push('/feed')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition-colors-fast">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
          Back
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-center justify-center">
              <span className="text-base font-semibold text-white">O</span>
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">{BRAND.name}</span>
          </div>

          {/* Card */}
          <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-8">
            <h1 className="text-xl font-bold text-white mb-1">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              {mode === 'login' ? 'Sign in to continue' : `Join ${BRAND.name} today`}
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            )}

            {mode === 'register' && step === 1 && (
              <form onSubmit={handleStep1Submit} className="space-y-5">
                <div>
                  <input
                    type="text"
                    placeholder="Name"
                    value={formData.displayName}
                    onChange={(e) => updateFormData('displayName', e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-soft)] text-white"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Username"
                    value={formData.username}
                    onChange={(e) => updateFormData('username', e.target.value.toLowerCase())}
                    required
                    pattern="^[a-z0-9_]{3,30}$"
                    title="3-30 characters, lowercase letters, numbers, and underscores only"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-soft)] text-white"
                  />
                </div>
                <div>
                  <input
                    type="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(e) => updateFormData('email', e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-soft)] text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Please wait...' : 'Continue'}
                </button>
              </form>
            )}

            {mode === 'register' && step === 2 && (
              <div className="space-y-5">
                <div>
                  <input
                    type="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={(e) => updateFormData('password', e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-soft)] text-white"
                  />
                </div>
                <div className="flex items-start gap-3">
                  <input type="checkbox" id="terms" required className="w-4 h-4 mt-0.5 rounded border-[var(--border-subtle)] bg-[var(--bg-tertiary)]" />
                  <label htmlFor="terms" className="text-sm text-[var(--text-muted)]">
                    I agree to the{' '}
                    <Link href="#" className="text-[var(--accent-primary)] hover:underline">Terms</Link>
                    {' '}and{' '}
                    <Link href="#" className="text-[var(--accent-primary)] hover:underline">Privacy</Link>
                  </label>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 py-3 rounded-xl border border-[var(--border-soft)] text-sm font-medium text-white hover:bg-[var(--bg-tertiary)] transition-colors-fast"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleRegisterSubmit}
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div>
                  <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(e) => updateFormData('email', e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-soft)] text-white"
                  />
                </div>

                <div>
                  <div className="relative">
                    <input
                      type="password"
                      name="password"
                      placeholder="Password"
                      value={formData.password}
                      onChange={(e) => updateFormData('password', e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-soft)] text-white pr-10"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="remember" className="w-4 h-4 rounded border-[var(--border-subtle)] bg-[var(--bg-tertiary)]" />
                    <span className="text-sm text-[var(--text-muted)]">Remember me</span>
                  </label>
                  <Link href="/auth/reset-password" className="text-sm text-[var(--accent-primary)] hover:underline">Forgot password?</Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Please wait...' : 'Sign in'}
                </button>
              </form>
            )}
          </div>

          <p className="text-center mt-6 text-sm text-[var(--text-muted)]">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <Link href="/auth/register" className="text-[var(--accent-primary)] hover:underline">Sign up</Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link href="/auth/login" className="text-[var(--accent-primary)] hover:underline">Sign in</Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}