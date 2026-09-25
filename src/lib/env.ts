function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '')
}

/** Prefer HTTPS when the admin UI is served over HTTPS (avoids mixed-content blocks). */
function resolveApiBase(raw: string | undefined): string {
  const fallback = 'http://localhost:7000/api/v2'
  let base = stripTrailingSlash((raw || '').trim() || fallback)

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    const isLocal =
      /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base) ||
      base.startsWith('/')
    if (!isLocal && base.startsWith('http://')) {
      base = `https://${base.slice('http://'.length)}`
    }
  }

  return base
}

const API_BASE = resolveApiBase(
  import.meta.env.VITE_API_BASE_URL as string | undefined,
)

export const env = {
  API_BASE_URL: API_BASE,
  /** From .env — password login only when ENVIRONMENT=dev */
  ENVIRONMENT: String(import.meta.env.ENVIRONMENT || '').trim().toLowerCase(),
} as const

/** True only when ENVIRONMENT=dev in .env (local email/password login). */
export const isDevEnvironment = env.ENVIRONMENT === 'dev'

export function buildApiUrl(path: string): string {
  const clean = path.replace(/^\//, '')
  return `${API_BASE}/${clean}`
}

export { API_BASE }
