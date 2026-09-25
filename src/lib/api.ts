import { buildApiUrl } from './env'
import { clearAuthTokens, getToken, setAuthTokens, getRefreshToken } from './token'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function tryRefresh(): Promise<string | null> {
  const refresh = getRefreshToken()
  if (!refresh) return null
  try {
    const res = await fetch(buildApiUrl('auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) {
      clearAuthTokens()
      return null
    }
    const data = (await res.json()) as { access_token?: string }
    if (!data.access_token) {
      clearAuthTokens()
      return null
    }
    setAuthTokens(data.access_token)
    return data.access_token
  } catch {
    return null
  }
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`
    return fetch(buildApiUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  let res = await doFetch(getToken())
  if (res.status === 401) {
    const next = await tryRefresh()
    if (next) res = await doFetch(next)
  }

  const text = await res.text()
  if (!res.ok) {
    let message = text || `HTTP ${res.status}`
    try {
      const j = JSON.parse(text) as { detail?: unknown; error?: string }
      if (typeof j.detail === 'string') message = j.detail
      else if (Array.isArray(j.detail)) message = JSON.stringify(j.detail)
      else if (j.error) message = j.error
    } catch {
      /* keep */
    }
    throw new ApiError(res.status, message)
  }
  if (!text) return {} as T
  return JSON.parse(text) as T
}

export async function apiRequestForm<T>(path: string, formData: FormData): Promise<T> {
  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    // Do not set Content-Type — browser sets multipart boundary.
    if (token) headers.Authorization = `Bearer ${token}`
    return fetch(buildApiUrl(path), {
      method: 'POST',
      headers,
      body: formData,
    })
  }

  let res = await doFetch(getToken())
  if (res.status === 401) {
    const next = await tryRefresh()
    if (next) res = await doFetch(next)
  }

  const text = await res.text()
  if (!res.ok) {
    let message = text || `HTTP ${res.status}`
    try {
      const j = JSON.parse(text) as { detail?: unknown; error?: string }
      if (typeof j.detail === 'string') message = j.detail
      else if (Array.isArray(j.detail)) message = JSON.stringify(j.detail)
      else if (j.error) message = j.error
    } catch {
      /* keep */
    }
    throw new ApiError(res.status, message)
  }
  if (!text) return {} as T
  return JSON.parse(text) as T
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body),
  postForm: <T>(path: string, formData: FormData) => apiRequestForm<T>(path, formData),
  put: <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
}

/**
 * Backend list endpoints wrap rows inconsistently:
 * - most platform lists: `{ data: T[], pagination? }`
 * - users: `{ items: T[] }`
 * - emails: bare `T[]`
 */
export function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (!payload || typeof payload !== 'object') return []
  const obj = payload as Record<string, unknown>
  for (const key of ['data', 'items', 'organizations', 'users', 'shipments', 'rules', 'emails'] as const) {
    const v = obj[key]
    if (Array.isArray(v)) return v as T[]
  }
  return []
}

/** Superadmin / platform endpoint helpers */
export const SA = {
  me: 'auth/me',
  loginMicrosoft: 'login/microsoft?app=admin',
  stats: 'superadmin/dashboard/stats',
  settings: 'superadmin/settings',
  setting: (key: string) => `superadmin/settings/${key}`,

  hubConnection: 'superadmin/hub/connection',
  hubConnectionTest: 'superadmin/hub/connection/test',
  hubShipments: 'superadmin/hub/shipments',
  hubShipment: (id: string) => `superadmin/hub/shipments/${id}`,
  hubCarriers: 'superadmin/hub/carriers',
  hubPurge: 'superadmin/hub/purge-cache',
  hubDelete: 'superadmin/hub/delete-shipments',
  hubWebhookStatus: 'superadmin/hub/webhook-status',
  hubRegisterWebhook: 'superadmin/hub/register-webhook',
  hubRefreshByStatus: 'superadmin/hub/refresh-by-status',

  orgs: 'organizations',
  org: (id: string) => `organizations/${id}`,
  orgApprove: (id: string) => `organizations/${id}/approve`,
  orgReject: (id: string) => `organizations/${id}/reject`,
  orgMembers: (id: string) => `organizations/${id}/members`,
  orgMember: (orgId: string, userId: string) => `organizations/${orgId}/members/${userId}`,
  orgInvites: (id: string) => `organizations/${id}/invites`,
  orgCustomers: (id: string) => `organizations/${id}/customers`,
  orgCustomer: (orgId: string, customerOrgId: string) =>
    `organizations/${orgId}/customers/${customerOrgId}`,
  orgShipments: (id: string) => `organizations/${id}/shipments`,
  orgShipmentCreate: (id: string) => `organizations/${id}/shipments`,
  orgImportsUpload: (id: string) => `organizations/${id}/imports/upload`,
  orgOffices: (id: string) => `organizations/${id}/offices`,
  orgOffice: (orgId: string, officeId: number) => `organizations/${orgId}/offices/${officeId}`,
  orgOfficeMembers: (orgId: string, officeId: number) =>
    `organizations/${orgId}/offices/${officeId}/members`,
  orgOfficeMember: (orgId: string, officeId: number, userId: string) =>
    `organizations/${orgId}/offices/${officeId}/members/${userId}`,
  orgFieldDefs: (id: string) => `organizations/${id}/field-definitions`,
  orgFieldDef: (orgId: string, fieldId: string) =>
    `organizations/${orgId}/field-definitions/${fieldId}`,
  orgConnections: (id: string) => `organizations/${id}/connections`,
  orgConnection: (orgId: string, connectionId: string) =>
    `organizations/${orgId}/connections/${connectionId}`,
  orgAssignmentRules: (id: string) => `organizations/${id}/assignment-rules`,
  orgAssignmentRule: (orgId: string, ruleId: string) =>
    `organizations/${orgId}/assignment-rules/${ruleId}`,
  orgEmailSettings: (id: string) => `organizations/${id}/email-settings`,
  orgEmails: (id: string) => `organizations/${id}/emails`,

  users: 'users',
  user: (id: string) => `users/${id}`,
  loginActivity: 'users/login-activity',

  shipments: 'superadmin/shipments',
  shipment: (id: string) => `superadmin/shipments/${id}`,
  shipmentAnalytics: 'superadmin/shipments/analytics',
  shipmentSyncFromHub: (id: string) => `superadmin/shipments/${id}/sync-from-hub`,
  bulkAssign: 'superadmin/shipments/bulk-assign',
  searchShipments: 'superadmin/search/shipments',
  sharedShipmentsSearch: 'superadmin/shared-shipments/search',
  containers: 'superadmin/containers',
  missingMbl: 'superadmin/missing-mbl',
  assignmentRules: 'superadmin/assignment-rules',
  assignmentRule: (id: string) => `superadmin/assignment-rules/${id}`,
  assignmentRuleTest: 'superadmin/assignment-rules/test',
  sourceConnections: 'superadmin/source-connections',
  discoverPayloadPaths: 'superadmin/payload-paths/discover',

  emails: 'emails',
  emailTemplates: 'email/templates',
  emailSend: 'email/send',
}
