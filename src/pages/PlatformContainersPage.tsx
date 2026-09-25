import { useQuery } from '@tanstack/react-query'
import { Link, useSearch } from 'wouter'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, SA, unwrapList } from '../lib/api'
import { pickStr, unwrapPagination } from '../lib/normalize'
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
import { formatDate, formatDt, type PlatformContainerRow } from '../types/shipments'

function normalizeContainer(raw: unknown): PlatformContainerRow {
  const id = pickStr(raw, 'id', 'id')
  return {
    id,
    container_number: pickStr(raw, 'containerNumber', 'container_number'),
    container_size: pickStr(raw, 'containerSize', 'container_size') || null,
    container_type: pickStr(raw, 'containerType', 'container_type') || null,
    status: pickStr(raw, 'status', 'status') || null,
    current_location_name:
      pickStr(raw, 'currentLocationName', 'current_location_name') || null,
    vessel_name: pickStr(raw, 'vesselName', 'vessel_name') || null,
    eta: pickStr(raw, 'eta', 'eta') || null,
    ata: pickStr(raw, 'ata', 'ata') || null,
    lfd: pickStr(raw, 'lfd', 'lfd') || null,
    lrd: pickStr(raw, 'lrd', 'lrd') || null,
    shipment_id: pickStr(raw, 'shipmentId', 'shipment_id'),
    mbl: pickStr(raw, 'mbl', 'mbl'),
    scac: pickStr(raw, 'scac', 'scac') || null,
    tai_shipment_id: pickStr(raw, 'taiShipmentId', 'tai_shipment_id') || null,
    org_id: pickStr(raw, 'orgId', 'org_id'),
    org_name: pickStr(raw, 'orgName', 'org_name', '—'),
    tags: Array.isArray((raw as { tags?: unknown }).tags)
      ? ((raw as { tags: string[] }).tags)
      : [],
  }
}

export function PlatformContainersPage() {
  const searchString = useSearch()
  const initialSearch = useMemo(() => {
    const params = new URLSearchParams(
      searchString.startsWith('?') ? searchString.slice(1) : searchString,
    )
    return (params.get('search') || '').trim()
  }, [searchString])

  const [search, setSearch] = useState(initialSearch)
  const [applied, setApplied] = useState(initialSearch)
  const [orgId, setOrgId] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch)
      setApplied(initialSearch)
      setPage(1)
    }
  }, [initialSearch])

  const orgsQuery = useQuery({
    queryKey: ['platform-container-orgs'],
    queryFn: async () => {
      const payload = await api.get(`${SA.orgs}?approved=true&page_size=50`)
      return unwrapList<{ id?: string; name?: string }>(payload)
    },
  })

  const listQuery = useQuery({
    queryKey: ['platform-containers', applied, orgId, page],
    queryFn: async () => {
      const qs = new URLSearchParams()
      qs.set('page', String(page))
      qs.set('page_size', '25')
      if (applied) qs.set('search', applied)
      if (orgId) qs.set('org_id', orgId)
      const payload = await api.get(`${SA.containers}?${qs}`)
      return {
        rows: unwrapList(payload).map(normalizeContainer),
        pagination: unwrapPagination(payload),
      }
    },
  })

  const rows = listQuery.data?.rows ?? []
  const pagination = listQuery.data?.pagination

  function onSearch(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setApplied(search.trim())
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Containers"
        description="Browse containers across organizations. Open a row for full shipment and event detail."
      />

      <SectionCard title="Filters">
        <form
          onSubmit={onSearch}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]"
        >
          <Field label="Search">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Container number or MBL"
            />
          </Field>
          <Field label="Organization">
            <Select value={orgId} onChange={(e) => { setOrgId(e.target.value); setPage(1) }}>
              <option value="">All orgs</option>
              {(orgsQuery.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Apply
            </Button>
          </div>
        </form>
      </SectionCard>

      {listQuery.isError ? (
        <ErrorBanner
          message={
            listQuery.error instanceof ApiError
              ? listQuery.error.message
              : 'Failed to load containers'
          }
        />
      ) : null}

      <SectionCard
        title="Results"
        description={pagination ? `${pagination.total} total` : undefined}
      >
        {listQuery.isLoading ? (
          <LoadingBlock label="Loading containers…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No containers" body="Try another search or org filter." />
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {rows.map((row) => (
                <Link
                  key={`${row.org_id}-${row.id}`}
                  href={`/shipments/${row.shipment_id}?org=${row.org_id}&container=${row.id}`}
                  className="block rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]/40 p-3"
                >
                  <p className="font-mono font-semibold text-[var(--brand)]">
                    {row.container_number}
                  </p>
                  <p className="mt-1 text-sm">{row.mbl}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {row.org_name} · {row.scac || '—'}
                  </p>
                  <div className="mt-2">
                    <Badge>{row.status?.replace(/_/g, ' ') || '—'}</Badge>
                  </div>
                </Link>
              ))}
            </div>

            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Container</Th>
                    <Th>MBL</Th>
                    <Th>Org</Th>
                    <Th>Status</Th>
                    <Th>Location</Th>
                    <Th>LFD</Th>
                    <Th>LRD</Th>
                    <Th>Updated ETA</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.org_id}-${row.id}`} className="hover:bg-[var(--elevate)]">
                      <Td>
                        <Link
                          href={`/shipments/${row.shipment_id}?org=${row.org_id}&container=${row.id}`}
                          className="font-mono font-semibold text-[var(--brand)] hover:underline"
                        >
                          {row.container_number}
                        </Link>
                        {row.tai_shipment_id ? (
                          <div className="text-[10px] text-[var(--muted)]">
                            TAI {row.tai_shipment_id}
                          </div>
                        ) : null}
                      </Td>
                      <Td>
                        <Link
                          href={`/shipments/${row.shipment_id}?org=${row.org_id}`}
                          className="font-semibold hover:underline"
                        >
                          {row.mbl}
                        </Link>
                      </Td>
                      <Td className="text-sm">{row.org_name}</Td>
                      <Td>
                        <Badge>{row.status?.replace(/_/g, ' ') || '—'}</Badge>
                      </Td>
                      <Td className="text-sm">{row.current_location_name || '—'}</Td>
                      <Td className="text-xs">{formatDate(row.lfd)}</Td>
                      <Td className="text-xs">{formatDate(row.lrd)}</Td>
                      <Td className="text-xs text-[var(--muted)]">{formatDt(row.eta)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            {pagination && pagination.totalPages > 1 ? (
              <div className="mt-4 flex justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="self-center text-sm text-[var(--muted)]">
                  Page {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>
    </div>
  )
}
