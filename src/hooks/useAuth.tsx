import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, SA } from '../lib/api'
import { clearAuthTokens, getToken, setAuthTokens } from '../lib/token'

export const NOT_AUTHORIZED_MESSAGE =
  'You are not authorized to access Super Admin. A superuser account is required.'

export type AdminUser = {
  id: string
  email: string
  full_name?: string
  is_superuser: boolean
  is_active?: boolean
}

type AuthState = {
  user: AdminUser | null
  loading: boolean
  loginWithTokens: (access: string, refresh?: string | null) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await api.get<AdminUser>(SA.me)
      if (!me.is_superuser) {
        clearAuthTokens()
        setUser(null)
      } else {
        setUser(me)
      }
    } catch {
      clearAuthTokens()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshMe()
  }, [refreshMe])

  const loginWithTokens = useCallback(
    async (access: string, refresh?: string | null) => {
      setAuthTokens(access, refresh)
      setLoading(true)
      try {
        const me = await api.get<AdminUser>(SA.me)
        if (!me.is_superuser) {
          clearAuthTokens()
          setUser(null)
          throw new Error(NOT_AUTHORIZED_MESSAGE)
        }
        setUser(me)
      } catch (err) {
        clearAuthTokens()
        setUser(null)
        throw err instanceof Error ? err : new Error('Could not load user')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const logout = useCallback(() => {
    clearAuthTokens()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, loginWithTokens, logout, refreshMe }),
    [user, loading, loginWithTokens, logout, refreshMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
