'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase, missingEnv } from '../lib/supabase'

type Mode = 'signin' | 'signup'

const SIGN_IN_TIMEOUT_MS = 30_000

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [dbStatus, setDbStatus] = useState<'unknown' | 'ok' | 'paused'>('unknown')

  useEffect(() => {
    supabase.auth.signOut()
  }, [])

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      toast.error('Please enter your email and password.')
      return
    }
    setLoading(true)
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), SIGN_IN_TIMEOUT_MS)
      )
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        timeout,
      ])
      if (error) {
        toast.error(error.message)
        return
      }
      router.push('/')
      router.refresh()
    } catch (e) {
      if (e instanceof Error && e.message === 'TIMEOUT') {
        setDbStatus('paused')
        toast.error('Database is not responding. See the banner above for instructions.')
      } else {
        toast.error(e instanceof Error ? e.message : 'Sign in failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async () => {
    if (!name.trim() || !email.trim() || !password) {
      toast.error('Name, email, and password are all required.')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    const userId = data.user?.id
    if (userId) {
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })

      const existingProfile = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle()

      if (!existingProfile.data) {
        const isTrulyFirst = countError === null && count === 0
        const role = isTrulyFirst ? 'Master' : 'Contributor'

        const { error: insertError } = await supabase.from('profiles').insert({
          id: userId,
          name: name.trim(),
          email: email.trim(),
          role,
        })

        if (!insertError) {
          toast.success(
            role === 'Master'
              ? 'Account created — you are the Master user.'
              : 'Account created — you have been assigned the Contributor role.'
          )
        }
      } else {
        toast.success('Signed in successfully.')
      }
    }

    router.push('/')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {missingEnv && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong>Configuration error:</strong> Supabase environment variables are missing.
            Go to your Vercel dashboard → Project → Settings → Environment Variables and confirm
            <code className="mx-1 rounded bg-red-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and
            <code className="mx-1 rounded bg-red-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
            are set, then redeploy.
          </div>
        )}
        {dbStatus === 'paused' && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm text-orange-900">
            <strong className="block text-base">⚠ Database is paused</strong>
            <p className="mt-1">Your Supabase project has been paused due to inactivity (free tier).</p>
            <p className="mt-2 font-medium">To restore it:</p>
            <ol className="mt-1 list-decimal list-inside space-y-1">
              <li>Go to <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline font-semibold">supabase.com/dashboard</a></li>
              <li>Open your project — you will see a <strong>"Restore project"</strong> button</li>
              <li>Click it and wait ~2 minutes</li>
              <li>Refresh this page and sign in</li>
            </ol>
            <p className="mt-3 text-xs text-orange-700">To prevent this permanently, set up a free ping monitor at <a href="https://uptimerobot.com" target="_blank" rel="noopener noreferrer" className="underline">uptimerobot.com</a> pointing to <code className="bg-orange-100 px-1 rounded">/api/health</code> on your app URL.</p>
          </div>
        )}
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Document Management</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {mode === 'signin'
              ? 'Sign in to access your workspace.'
              : 'Sign up to join your team workspace.'}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-100">
          <div className="mb-6 flex rounded-2xl border border-slate-200 p-1">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                mode === 'signin' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                mode === 'signup' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                onKeyDown={(e) => e.key === 'Enter' && (mode === 'signin' ? handleSignIn() : handleSignUp())}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min. 6 characters' : 'Your password'}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                onKeyDown={(e) => e.key === 'Enter' && (mode === 'signin' ? handleSignIn() : handleSignUp())}
              />
            </div>

            <button
              type="button"
              onClick={mode === 'signin' ? handleSignIn : handleSignUp}
              disabled={loading}
              className="mt-2 w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
                : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </div>

        {mode === 'signup' && (
          <p className="text-center text-xs text-slate-500">
            The first person to sign up automatically becomes the Master user and can manage all roles.
          </p>
        )}
      </div>
    </main>
  )
}
