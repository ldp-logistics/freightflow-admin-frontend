import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '../hooks/useAuth'
import { ErrorBanner } from '../components/ui'

export function MicrosoftCallbackPage() {
  const { loginWithTokens } = useAuth()
  const [, setLoc] = useLocation()
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const refresh = params.get('refresh_token')
    if (!token) {
      const message = 'Missing token from Microsoft callback'
      if (window.opener) {
        window.opener.postMessage({ type: 'MICROSOFT_LOGIN_ERROR', message }, '*')
        window.close()
        return
      }
      setError(message)
      return
    }

    // Popup flow: hand tokens to the opener login page (it shows errors).
    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'MICROSOFT_LOGIN_SUCCESS',
          token,
          refresh_token: refresh,
        },
        '*',
      )
      window.close()
      return
    }

    // Direct navigation (no popup): complete login here.
    void (async () => {
      try {
        await loginWithTokens(token, refresh)
        setLoc('/')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not complete login')
      }
    })()
  }, [loginWithTokens, setLoc])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <div className="w-full max-w-md">
          <ErrorBanner message={error} />
        </div>
        <Link href="/login" className="text-sm font-medium text-[var(--brand)] underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
      Completing Microsoft sign-in…
    </div>
  )
}
