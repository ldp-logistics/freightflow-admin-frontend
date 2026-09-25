import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
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
      setError('Missing token from Microsoft callback')
      return
    }
    void (async () => {
      try {
        await loginWithTokens(token, refresh)
        setLoc('/')
      } catch {
        setError('Could not complete login')
      }
    })()
  }, [loginWithTokens, setLoc])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorBanner message={error} />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
      Completing Microsoft sign-in…
    </div>
  )
}
