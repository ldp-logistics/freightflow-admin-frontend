const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:7000/api/v2'

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
