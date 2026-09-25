/** Dual-key helpers for backend JSON that mixes camelCase aliases and snake_case. */

export type AnyRecord = Record<string, unknown>

export function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? (value as AnyRecord) : {}
}

export function pick<T = unknown>(obj: unknown, camel: string, snake: string): T | undefined {
  const r = asRecord(obj)
  if (r[camel] !== undefined && r[camel] !== null) return r[camel] as T
  if (r[snake] !== undefined && r[snake] !== null) return r[snake] as T
  return undefined
}

export function pickBool(obj: unknown, camel: string, snake: string, fallback = false): boolean {
  const v = pick(obj, camel, snake)
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === 1) return true
  if (v === 'false' || v === 0) return false
  return fallback
}

export function pickStr(obj: unknown, camel: string, snake: string, fallback = ''): string {
  const v = pick(obj, camel, snake)
  if (v === undefined || v === null) return fallback
  return String(v)
}

export function orgIsApproved(org: unknown): boolean {
  return pickBool(org, 'isApproved', 'is_approved', false)
}

export type NormalizedOrg = {
  id: string
  name: string
  isApproved: boolean
  isInternalOrg: boolean
  isConsignee: boolean
  isHblShipper: boolean
  isOverseaAgent: boolean
  complianceEnabled: boolean
  address?: string
  createdAt?: string
  approvedAt?: string
  raw: AnyRecord
}

export function normalizeOrg(raw: unknown): NormalizedOrg {
  const r = asRecord(raw)
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    isApproved: orgIsApproved(r),
    isInternalOrg: pickBool(r, 'isInternalOrg', 'is_internal_org'),
    isConsignee: pickBool(r, 'isConsignee', 'is_consignee'),
    isHblShipper: pickBool(r, 'isHblShipper', 'is_hbl_shipper'),
    isOverseaAgent: pickBool(r, 'isOverseaAgent', 'is_oversea_agent'),
    complianceEnabled: pickBool(r, 'complianceEnabled', 'compliance_enabled'),
    address: pickStr(r, 'address', 'address') || undefined,
    createdAt: pickStr(r, 'createdAt', 'created_at') || undefined,
    approvedAt: pickStr(r, 'approvedAt', 'approved_at') || undefined,
    raw: r,
  }
}

export function orgKindLabel(org: NormalizedOrg): string {
  if (org.isInternalOrg) return 'Internal'
  const tags: string[] = []
  if (org.isConsignee) tags.push('Consignee')
  if (org.isHblShipper) tags.push('HBL shipper')
  if (org.isOverseaAgent) tags.push('Oversea agent')
  return tags.length ? tags.join(', ') : 'Customer'
}

export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function unwrapPagination(payload: unknown): PaginationMeta {
  const r = asRecord(payload)
  const nested = asRecord(r.pagination)
  // Prefer nested `pagination` when present; fall back to top-level
  // `{ items, total, page, page_size }` (users / login-activity).
  const hasNested = Object.keys(nested).length > 0
  const src = hasNested ? nested : r
  const page = Number(src.page ?? 1) || 1
  const pageSize = Number(pick(src, 'pageSize', 'page_size') ?? 25) || 25
  const total = Number(src.total ?? 0) || 0
  const totalPages =
    Number(pick(src, 'totalPages', 'total_pages') ?? (Math.ceil(total / pageSize) || 0)) || 0
  return { page, pageSize, total, totalPages: totalPages || Math.max(1, Math.ceil(total / pageSize) || 1) }
}
