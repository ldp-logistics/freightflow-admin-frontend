import { useEffect, useState, type FormEvent } from 'react'
import { Redirect, useLocation } from 'wouter'
import { buildApiUrl, isDevEnvironment } from '../lib/env'
import { SA } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { Button, ErrorBanner, Field, Input } from '../components/ui'

export function LoginPage() {
  const { user, loading, loginWithTokens } = useAuth()
  const [, setLoc] = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const showPasswordLogin = isDevEnvironment

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) {
      setError(err)
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      void (async () => {
        if (event.data?.type === 'MICROSOFT_LOGIN_SUCCESS' && event.data.token) {
          setBusy(true)
          setError('')
          try {
            await loginWithTokens(event.data.token, event.data.refresh_token)
            setLoc('/')
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Login failed')
          } finally {
            setBusy(false)
          }
        } else if (
          event.data?.type === 'MICROSOFT_LOGIN_ERROR' ||
          event.data?.type === 'MICROSOFT_LOGIN_FAILED'
        ) {
          setError(event.data.message || 'Microsoft login failed')
        }
      })()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [loginWithTokens, setLoc])

  if (!loading && user) return <Redirect to="/" />

  async function startMicrosoft() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(buildApiUrl(SA.loginMicrosoft))
      const data = (await res.json()) as { url?: string; detail?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.detail || 'Could not start Microsoft login')
      }
      window.open(data.url, '_blank')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function onPasswordLogin(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('username', email.trim())
      formData.append('password', password)
      const res = await fetch(buildApiUrl('auth/login'), {
        method: 'POST',
        body: formData,
      })
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string
        refresh_token?: string
        detail?: string
      }
      if (!res.ok) {
        throw new Error(
          typeof data.detail === 'string' ? data.detail : 'Invalid email or password',
        )
      }
      if (!data.access_token) {
        throw new Error('Login response missing token')
      }
      await loginWithTokens(data.access_token, data.refresh_token)
      setLoc('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-10%] h-[50%] w-[50%] rounded-full bg-[var(--ink)]/[0.03] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-[var(--brand)]/[0.04] blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-md)]">
        <div className="border-b border-[var(--line)] bg-[var(--surface)] px-6 py-5 text-center">
          <img
            src="/black-logo.png"
            alt="LDP Logistics"
            className="mx-auto h-10 w-auto object-contain"
          />
          <p className="ldp-eyebrow mt-4 justify-center">FreightFlow</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ink)]">Super Admin</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {showPasswordLogin
              ? 'Microsoft SSO or email/password (local development). Superuser required.'
              : 'Sign in with Microsoft. Superuser required.'}
          </p>
        </div>

        <div className="space-y-3 px-6 py-5">
          {error ? <ErrorBanner message={error} /> : null}
          <Button type="button" className="w-full" disabled={busy || loading} onClick={startMicrosoft}>
            {busy ? 'Opening Microsoft…' : 'Sign in with Microsoft'}
          </Button>

          {showPasswordLogin ? (
            <form onSubmit={onPasswordLogin} className="space-y-3 border-t border-[var(--line)] pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Dev password login
              </p>
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy || loading}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}
