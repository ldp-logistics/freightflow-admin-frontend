import { useQuery } from '@tanstack/react-query'
import { Link } from 'wouter'
import { api, ApiError, SA } from '../lib/api'
import { ErrorBanner, PageHeader } from '../components/ui'

type Stats = {
  total_organizations?: number
  approved_organizations?: number
  pending_organizations?: number
  total_users?: number
  total_shipments?: number
  active_shipments?: number
  archived_shipments?: number
  total_orgs?: number
  approved_orgs?: number
  pending_orgs?: number
}

const shortcuts = [
  { href: '/organizations', label: 'Organizations', desc: 'Create, edit & approve tenants' },
  { href: '/workspace', label: 'Workspace', desc: 'Members, offices, fields, routing' },
  { href: '/shipments', label: 'Shipments', desc: 'Shared search & bulk assign' },
  { href: '/containers', label: 'Containers', desc: 'Browse containers & open detail' },
  { href: '/hub', label: 'Hub', desc: 'Shipments, carriers, maintenance' },
  { href: '/approvals', label: 'Approvals', desc: 'Pending org queue' },
  { href: '/settings', label: 'Settings', desc: 'Hub API connection' },
]

export function OverviewPage() {
  const query = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<Stats>(SA.stats),
  })

  const s = query.data
  const cards = [
    { label: 'Organizations', value: s?.total_organizations ?? s?.total_orgs },
    { label: 'Approved orgs', value: s?.approved_organizations ?? s?.approved_orgs },
    { label: 'Pending orgs', value: s?.pending_organizations ?? s?.pending_orgs },
    { label: 'Users', value: s?.total_users },
    { label: 'Shipments', value: s?.total_shipments },
    { label: 'Active shipments', value: s?.active_shipments },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Platform-wide counts and shortcuts for day-to-day super admin work."
      />
      {query.isError ? (
        <ErrorBanner
          message={query.error instanceof ApiError ? query.error.message : 'Failed to load stats'}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="ldp-card p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {c.label}
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-[var(--ink)]">
              {query.isLoading ? '…' : (c.value ?? '—')}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Shortcuts
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {shortcuts.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="ldp-card group flex items-center justify-between gap-3 p-4 transition hover:border-[var(--ink)]/20"
            >
              <div>
                <p className="font-semibold text-[var(--ink)] group-hover:text-[var(--brand)]">
                  {item.label}
                </p>
                <p className="mt-0.5 text-sm text-[var(--muted)]">{item.desc}</p>
              </div>
              <span className="text-[var(--muted)]" aria-hidden>
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
