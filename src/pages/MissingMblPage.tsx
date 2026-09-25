import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError, SA, unwrapList } from '../lib/api'
import { pick, pickStr, unwrapPagination } from '../lib/normalize'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  SectionCard,
  Table,
  Td,
  Th,
} from '../components/ui'

type Intake = {
  source_id: string
  org_name?: string
  source_type?: string
  source_ref?: string
  state?: string
  mbl?: string | null
  container_number?: string
  scac?: string
  customer_name?: string
  received_at?: string
  created_at?: string
  extracted?: unknown
  raw_payload?: unknown
}

const PAGE_SIZE = 25

function mapIntake(raw: unknown): Intake {
  return {
    source_id: String(pick(raw, 'sourceId', 'source_id') ?? ''),
    org_name: pickStr(raw, 'orgName', 'org_name') || undefined,
    source_type: pickStr(raw, 'sourceType', 'source_type') || undefined,
    source_ref: pickStr(raw, 'sourceRef', 'source_ref') || undefined,
    state: pickStr(raw, 'state', 'state') || undefined,
    mbl: (pick(raw, 'mbl', 'mbl') as string | null | undefined) ?? null,
    container_number: pickStr(raw, 'containerNumber', 'container_number') || undefined,
    scac: pickStr(raw, 'scac', 'scac') || undefined,
    customer_name: pickStr(raw, 'customerName', 'customer_name') || undefined,
    received_at: pickStr(raw, 'receivedAt', 'received_at') || undefined,
    created_at: pickStr(raw, 'createdAt', 'created_at') || undefined,
    extracted: pick(raw, 'extracted', 'extracted'),
    raw_payload: pick(raw, 'rawPayload', 'raw_payload'),
  }
}

export function MissingMblPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Intake | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const query = useQuery({
    queryKey: ['missing-mbl', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
        includeRawPayload: 'true',
      })
      if (search) params.set('search', search)
      const payload = await api.get(`${SA.missingMbl}?${params}`)
      return {
        rows: unwrapList(payload).map(mapIntake),
        pagination: unwrapPagination(payload),
      }
    },
  })

  const rows = query.data?.rows ?? []
  const pagination = query.data?.pagination
  const totalPages = Math.max(1, pagination?.totalPages ?? 1)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Missing MBL"
        description="TAI intakes that arrived without an MBL and were never promoted to a shipment."
        actions={
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        }
      />

      <SectionCard title="Search">
        <Field label="Search">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Org, container, customer, source ref…"
          />
        </Field>
      </SectionCard>

      {query.isError ? (
        <ErrorBanner
          message={query.error instanceof ApiError ? query.error.message : 'Failed to load'}
        />
      ) : null}

      <SectionCard
        title="Intakes"
        description={
          pagination
            ? `${pagination.total} total · page ${pagination.page} of ${totalPages}`
            : undefined
        }
      >
        {query.isLoading ? (
          <LoadingBlock label="Loading intakes…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No missing-MBL intakes" body="All recent intakes include an MBL." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Org</Th>
                  <Th>Customer</Th>
                  <Th>Container</Th>
                  <Th>SCAC</Th>
                  <Th>State</Th>
                  <Th>Received</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.source_id} className="hover:bg-[var(--elevate)]">
                    <Td className="font-semibold">{r.org_name || '—'}</Td>
                    <Td>{r.customer_name || '—'}</Td>
                    <Td className="font-mono text-xs">{r.container_number || '—'}</Td>
                    <Td>{r.scac || '—'}</Td>
                    <Td>
                      <Badge tone="warn">{r.state || '—'}</Badge>
                    </Td>
                    <Td className="text-xs text-[var(--muted)]">
                      {r.received_at || r.created_at
                        ? new Date(r.received_at || r.created_at!).toLocaleString()
                        : '—'}
                    </Td>
                    <Td>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!py-1.5 !text-xs"
                        onClick={() => setSelected(r)}
                      >
                        Details
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-4 flex justify-between">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </SectionCard>

      <Dialog
        open={!!selected}
        title="Intake details"
        onClose={() => setSelected(null)}
        wide
      >
        {selected ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-[var(--muted)]">Source ID:</span>{' '}
              <span className="font-mono text-xs">{selected.source_id}</span>
            </p>
            <p>
              <span className="text-[var(--muted)]">Type / ref:</span>{' '}
              {selected.source_type || '—'} · {selected.source_ref || '—'}
            </p>
            <pre className="max-h-64 overflow-auto rounded border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs">
              {JSON.stringify(
                { extracted: selected.extracted, raw_payload: selected.raw_payload },
                null,
                2,
              )}
            </pre>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
