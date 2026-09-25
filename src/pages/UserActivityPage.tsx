import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiError, SA, unwrapList } from '../lib/api'
import {
  asRecord,
  normalizeOrg,
  pick,
  pickBool,
  pickStr,
  unwrapPagination,
} from '../lib/normalize'
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  SectionCard,
  Select,
  Table,
  Td,
  Th,
} from '../components/ui'

type LoginStatus = 'all' | 'logged_in' | 'never'
type OrgKindFilter = 'all' | 'internal' | 'customer'

const PAGE_SIZE = 25

function formatDateTime(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return {
    date: date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  }
}

function DateTimeCell({ value, empty = '—' }: { value?: string | null; empty?: string }) {
  const parts = formatDateTime(value)
  if (!parts) return <span className="text-[var(--muted)]">{empty}</span>
  return (
    <div>
      <div className="whitespace-nowrap">{parts.date}</div>
      <div className="text-xs text-[var(--muted)] whitespace-nowrap">{parts.time}</div>
    </div>
  )
}

type ActivityUser = {
  id: string
  email: string
  name?: string
  isActive: boolean
  lastLoginAt?: string
  createdAt?: string
  orgs: { orgId: string; name: string; isInternal: boolean }[]
  offices: { officeId: number; officeName: string; orgName?: string }[]
}

type ActivitySummary = {
  totalUsers: number
  neverLoggedIn: number
  loggedInLast7Days: number
  loggedInLast30Days: number
}

function mapActivityUser(raw: unknown): ActivityUser {
  const r = asRecord(raw)
  const orgs = Array.isArray(r.orgs)
    ? r.orgs.map((o) => ({
        orgId: pickStr(o, 'orgId', 'org_id'),
        name: pickStr(o, 'name', 'name'),
        isInternal: pickBool(o, 'isInternal', 'is_internal'),
      }))
    : []
  const offices = Array.isArray(r.offices)
    ? r.offices.map((o) => ({
        officeId: Number(pick(o, 'officeId', 'office_id') ?? 0),
        officeName: pickStr(o, 'officeName', 'office_name'),
        orgName: pickStr(o, 'orgName', 'org_name') || undefined,
      }))
    : []
  return {
    id: String(r.id ?? ''),
    email: pickStr(raw, 'email', 'email'),
    name: pickStr(raw, 'name', 'name') || undefined,
    isActive: pickBool(raw, 'isActive', 'is_active', true),
    lastLoginAt: pickStr(raw, 'lastLoginAt', 'last_login_at') || undefined,
    createdAt: pickStr(raw, 'createdAt', 'created_at') || undefined,
    orgs,
    offices,
  }
}

function mapSummary(raw: unknown): ActivitySummary {
  const r = asRecord(raw)
  return {
    totalUsers: Number(pick(r, 'totalUsers', 'total_users') ?? 0),
    neverLoggedIn: Number(pick(r, 'neverLoggedIn', 'never_logged_in') ?? 0),
    loggedInLast7Days: Number(pick(r, 'loggedInLast7Days', 'logged_in_last_7_days') ?? 0),
    loggedInLast30Days: Number(pick(r, 'loggedInLast30Days', 'logged_in_last_30_days') ?? 0),
  }
}

export function UserActivityPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<LoginStatus>('all')
  const [orgKind, setOrgKind] = useState<OrgKindFilter>('all')
  const [orgId, setOrgId] = useState('')
  const [officeId, setOfficeId] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [status, orgKind, orgId, officeId])

  useEffect(() => {
    setOrgId('')
    setOfficeId('')
  }, [orgKind])

  useEffect(() => {
    setOfficeId('')
  }, [orgId])

  const orgsQuery = useQuery({
    queryKey: ['user-activity-orgs', orgKind],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', page_size: '100' })
      if (orgKind === 'internal') params.set('isInternal', 'true')
      if (orgKind === 'customer') params.set('isInternal', 'false')
      const payload = await api.get(`${SA.orgs}?${params}`)
      return unwrapList(payload).map(normalizeOrg)
    },
  })

  const officesQuery = useQuery({
    queryKey: ['user-activity-offices', orgId],
    queryFn: async () => {
      const payload = await api.get(SA.orgOffices(orgId))
      return unwrapList(payload).map((raw) => {
        const r = asRecord(raw)
        return {
          id: Number(r.id ?? 0),
          name: pickStr(raw, 'name', 'name') || `Office #${r.id}`,
        }
      })
    },
    enabled: !!orgId,
  })

  const query = useQuery({
    queryKey: [
      'user-activity',
      page,
      debouncedSearch,
      status,
      orgKind,
      orgId,
      officeId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
        status,
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (orgKind === 'internal') params.set('orgIsInternal', 'true')
      if (orgKind === 'customer') params.set('orgIsInternal', 'false')
      if (orgId) params.set('orgId', orgId)
      if (officeId) params.set('officeId', officeId)
      const payload = await api.get(`${SA.loginActivity}?${params}`)
      const r = asRecord(payload)
      return {
        summary: mapSummary(r.summary),
        users: unwrapList(payload).map(mapActivityUser),
        pagination: unwrapPagination(payload),
      }
    },
  })

  const summary = query.data?.summary
  const users = query.data?.users || []
  const pagination = query.data?.pagination || {
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  }
  const totalPages = Math.max(1, pagination.totalPages)
  const orgs = orgsQuery.data || []
  const selectedOrg = orgs.find((o) => o.id === orgId)
  const showOfficeFilter = !!selectedOrg?.isInternalOrg

  const summaryCards: { key: LoginStatus | 'week' | 'month'; label: string; value: number }[] = [
    { key: 'all', label: 'Total users', value: summary?.totalUsers ?? 0 },
    { key: 'never', label: 'Never logged in', value: summary?.neverLoggedIn ?? 0 },
    { key: 'week', label: 'Logged in · 7 days', value: summary?.loggedInLast7Days ?? 0 },
    { key: 'month', label: 'Logged in · 30 days', value: summary?.loggedInLast30Days ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="User activity"
        description="Platform-wide login monitoring for superusers and users-monitor roles."
      />

      {query.isError ? (
        <ErrorBanner
          message={
            query.error instanceof ApiError
              ? query.error.message
              : 'Failed to load login activity'
          }
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const clickable = card.key === 'all' || card.key === 'never'
          const active =
            (card.key === 'all' && status === 'all') ||
            (card.key === 'never' && status === 'never')
          return (
            <button
              key={card.key}
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (card.key === 'all') setStatus('all')
                if (card.key === 'never') setStatus('never')
              }}
              className={`ldp-card px-4 py-3 text-left transition ${
                active ? 'ring-2 ring-[var(--brand)]' : ''
              } ${clickable ? 'hover:bg-[var(--elevate)]' : 'cursor-default'}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight">{card.value}</p>
            </button>
          )
        })}
      </div>

      <SectionCard title="Filters">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Search">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, username"
            />
          </Field>
          <Field label="Login status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as LoginStatus)}>
              <option value="all">All</option>
              <option value="logged_in">Has logged in</option>
              <option value="never">Never logged in</option>
            </Select>
          </Field>
          <Field label="Org type">
            <Select
              value={orgKind}
              onChange={(e) => setOrgKind(e.target.value as OrgKindFilter)}
            >
              <option value="all">All organizations</option>
              <option value="internal">Internal</option>
              <option value="customer">Customer</option>
            </Select>
          </Field>
          <Field label="Organization">
            <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">All</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          {showOfficeFilter ? (
            <Field label="Office">
              <Select
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                disabled={!orgId}
              >
                <option value="">All offices</option>
                {(officesQuery.data || []).map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Login activity"
        description={
          pagination.total
            ? `Page ${pagination.page} of ${totalPages} · ${pagination.total} total`
            : undefined
        }
      >
        {query.isLoading ? (
          <LoadingBlock label="Loading activity…" />
        ) : users.length === 0 ? (
          <EmptyState title="No users match" body="Adjust filters or search to see login activity." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Status</Th>
                  <Th>Last login</Th>
                  <Th>Created</Th>
                  <Th>Orgs / offices</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--elevate)]">
                    <Td>
                      <div className="font-semibold">{u.email}</div>
                      <div className="text-xs text-[var(--muted)]">{u.name || '—'}</div>
                    </Td>
                    <Td>
                      {u.isActive ? (
                        <Badge tone="ok">active</Badge>
                      ) : (
                        <Badge tone="danger">inactive</Badge>
                      )}
                    </Td>
                    <Td>
                      <DateTimeCell value={u.lastLoginAt} empty="Never" />
                    </Td>
                    <Td>
                      <DateTimeCell value={u.createdAt} />
                    </Td>
                    <Td>
                      <div className="flex max-w-xs flex-col gap-1">
                        {u.orgs.length === 0 && u.offices.length === 0 ? (
                          <span className="text-xs text-[var(--muted)]">—</span>
                        ) : null}
                        {u.orgs.map((o) => (
                          <Badge key={`${u.id}-${o.orgId}`} tone="neutral">
                            {o.name}
                            {o.isInternal ? ' · Internal' : ''}
                          </Badge>
                        ))}
                        {u.offices.map((o) => (
                          <Badge key={`${u.id}-${o.officeId}`} tone="brand">
                            {o.officeName}
                            {o.orgName ? ` · ${o.orgName}` : ''}
                          </Badge>
                        ))}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[var(--muted)]">
                Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
                {pagination.total}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pagination.page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
