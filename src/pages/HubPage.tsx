import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'wouter'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, SA } from '../lib/api'
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
  Select,
  Table,
  Td,
  Th,
  Textarea,
} from '../components/ui'

type HubSummary = {
  id: string
  primary_reference?: string
  mbl?: string
  container_number?: string
  current_status?: string
  carrier_scac?: string
  updated_at?: string
}

type HubCarrier = {
  scac: string
  name: string
  shipment_count: number
  refreshable_count?: number
}

type HubRefreshScope =
  | 'in_transit'
  | 'pod_awaiting'
  | 'pod_full_out'
  | 'tracking_in_progress'
  | 'active'

type RefreshQueued = {
  task_id?: string
  status?: string
  shipment_count?: number
  message?: string
}

const LIFECYCLE_SCOPES: { value: HubRefreshScope; label: string; hint: string }[] = [
  { value: 'in_transit', label: 'In transit', hint: 'BOOKED / IN_TRANSIT / AT_SEA' },
  { value: 'pod_awaiting', label: 'POD awaiting', hint: 'Containers at port (AT_PORT)' },
  { value: 'pod_full_out', label: 'POD full out', hint: 'DELIVERED / COMPLETED' },
  {
    value: 'tracking_in_progress',
    label: 'Tracking in progress',
    hint: 'PENDING / shells waiting on hub data',
  },
  { value: 'active', label: 'All active', hint: 'Everything except DELIVERED / COMPLETED' },
]

function parseMblList(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[\n,]+/)) {
    const mbl = part.trim().toUpperCase()
    if (!mbl || seen.has(mbl)) continue
    seen.add(mbl)
    out.push(mbl)
  }
  return out
}

function rowMbl(row: HubSummary): string {
  return (row.mbl || row.primary_reference || '').trim().toUpperCase()
}

function formatRefreshResult(r: RefreshQueued): string {
  return (
    r.message ||
    `Queued ${r.shipment_count ?? 0} shipment(s) · task ${r.task_id ?? '—'} (${r.status ?? 'queued'})`
  )
}

async function queueMblRefresh(mbls: string[]): Promise<RefreshQueued> {
  return api.post<RefreshQueued>(SA.hubRefreshByStatus, { scope: 'mbl', mbls })
}

async function queueCarrierRefresh(carriers: string[]): Promise<RefreshQueued> {
  return api.post<RefreshQueued>(SA.hubRefreshByStatus, {
    scope: 'carrier',
    carriers,
  })
}

export function HubPage() {
  const [, setLoc] = useLocation()
  const [q, setQ] = useState('')
  const [carrier, setCarrier] = useState('')
  const [status, setStatus] = useState('')
  const [applied, setApplied] = useState({ q: '', carrier: '', status: '' })
  const [cursor, setCursor] = useState<string | undefined>()
  const [stack, setStack] = useState<(string | undefined)[]>([])
  const [refs, setRefs] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')
  const [bulkErr, setBulkErr] = useState('')
  const [refreshScope, setRefreshScope] = useState<HubRefreshScope>('active')
  const [lifecycleMsg, setLifecycleMsg] = useState('')
  const [lifecycleErr, setLifecycleErr] = useState('')
  const [mblInput, setMblInput] = useState('')
  const [mblMsg, setMblMsg] = useState('')
  const [mblErr, setMblErr] = useState('')
  const [selected, setSelected] = useState<Record<string, HubSummary>>({})
  const [selectMsg, setSelectMsg] = useState('')
  const [selectErr, setSelectErr] = useState('')
  const [selectedScacs, setSelectedScacs] = useState<Record<string, true>>({})
  const [carrierMsg, setCarrierMsg] = useState('')
  const [carrierErr, setCarrierErr] = useState('')

  const listQuery = useQuery({
    queryKey: ['hub-shipments', applied, cursor],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (applied.q) qs.set('q', applied.q)
      if (applied.carrier) qs.set('carrier', applied.carrier)
      if (applied.status) qs.set('status', applied.status)
      qs.set('limit', '25')
      if (cursor) qs.set('cursor', cursor)
      return api.get<{ items: HubSummary[]; next_cursor?: string }>(
        `${SA.hubShipments}?${qs}`,
      )
    },
  })

  const carriersQuery = useQuery({
    queryKey: ['hub-carriers'],
    queryFn: () => api.get<{ carriers: HubCarrier[] }>(SA.hubCarriers),
  })

  const webhookQuery = useQuery({
    queryKey: ['hub-webhook'],
    queryFn: () =>
      api.get<{ status: string; configured: boolean; callback_url?: string }>(SA.hubWebhookStatus),
  })

  const registerWh = useMutation({
    mutationFn: () => api.post(SA.hubRegisterWebhook),
    onSuccess: () => void webhookQuery.refetch(),
  })

  const refreshByStatus = useMutation({
    mutationFn: () =>
      api.post<RefreshQueued>(SA.hubRefreshByStatus, { scope: refreshScope }),
    onSuccess: (r) => {
      setLifecycleMsg(formatRefreshResult(r))
      setLifecycleErr('')
    },
    onError: (e) => {
      setLifecycleErr(e instanceof ApiError ? e.message : 'Refresh failed')
      setLifecycleMsg('')
    },
  })

  const refreshByMbl = useMutation({
    mutationFn: (mbls: string[]) => queueMblRefresh(mbls),
    onSuccess: (r) => {
      setMblMsg(formatRefreshResult(r))
      setMblErr('')
      setMblInput('')
    },
    onError: (e) => {
      setMblErr(e instanceof ApiError ? e.message : 'Refresh failed')
      setMblMsg('')
    },
  })

  const refreshSelected = useMutation({
    mutationFn: (mbls: string[]) => queueMblRefresh(mbls),
    onSuccess: (r) => {
      setSelectMsg(formatRefreshResult(r))
      setSelectErr('')
      setSelected({})
    },
    onError: (e) => {
      setSelectErr(e instanceof ApiError ? e.message : 'Refresh failed')
      setSelectMsg('')
    },
  })

  const refreshByCarrier = useMutation({
    mutationFn: (carriers: string[]) => queueCarrierRefresh(carriers),
    onSuccess: (r) => {
      setCarrierMsg(formatRefreshResult(r))
      setCarrierErr('')
      setSelectedScacs({})
    },
    onError: (e) => {
      setCarrierErr(e instanceof ApiError ? e.message : 'Refresh failed')
      setCarrierMsg('')
    },
  })

  const bulkMut = useMutation({
    mutationFn: async (action: 'purge' | 'delete') => {
      const references = parseMblList(refs)
      const path = action === 'delete' ? SA.hubDelete : SA.hubPurge
      return api.post<{ affected?: number; matched?: number }>(path, {
        scope: 'references',
        references,
        type: 'MBL',
      })
    },
    onSuccess: (r) => {
      setBulkMsg(`Done — matched ${r.matched ?? 0}, affected ${r.affected ?? 0}`)
      setBulkErr('')
      void listQuery.refetch()
    },
    onError: (e) => {
      setBulkErr(e instanceof ApiError ? e.message : 'Bulk failed')
      setBulkMsg('')
    },
  })

  const items = listQuery.data?.items || []
  const selectedCount = Object.keys(selected).length
  const selectedMbls = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const row of Object.values(selected)) {
      const mbl = rowMbl(row)
      if (!mbl || seen.has(mbl)) continue
      seen.add(mbl)
      out.push(mbl)
    }
    return out
  }, [selected])

  const carriers = carriersQuery.data?.carriers ?? []
  const selectedCarrierList = useMemo(
    () => Object.keys(selectedScacs).sort(),
    [selectedScacs],
  )
  const allCarriersSelected =
    carriers.length > 0 && carriers.every((c) => !!selectedScacs[c.scac])

  function toggleScac(scac: string, checked: boolean) {
    const key = scac.trim().toUpperCase()
    if (!key) return
    setSelectedScacs((prev) => {
      const next = { ...prev }
      if (checked) next[key] = true
      else delete next[key]
      return next
    })
  }

  function toggleAllCarriers(checked: boolean) {
    setSelectedScacs((prev) => {
      if (!checked) return {}
      const next = { ...prev }
      for (const c of carriers) {
        const key = c.scac.trim().toUpperCase()
        if (key) next[key] = true
      }
      return next
    })
  }

  const allOnPageSelected =
    items.length > 0 && items.every((row) => !!selected[row.id])

  function toggleRow(row: HubSummary, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev }
      if (checked) next[row.id] = row
      else delete next[row.id]
      return next
    })
  }

  function togglePage(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev }
      for (const row of items) {
        if (checked) next[row.id] = row
        else delete next[row.id]
      }
      return next
    })
  }

  function onRefreshMbl(e: FormEvent) {
    e.preventDefault()
    const mbls = parseMblList(mblInput)
    if (!mbls.length) {
      setMblErr('Enter at least one MBL / shipment number')
      setMblMsg('')
      return
    }
    refreshByMbl.mutate(mbls)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hub"
        description="Inventory, scrape refresh, and hub maintenance."
        actions={
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => setLoc('/hub/shipments/new')}
          >
            Register on hub
          </Button>
        }
      />

      {/* Primary: inventory console */}
      <SectionCard
        title="Inventory"
        description={items.length ? `${items.length} on this page` : 'Search and refresh hub shipments'}
      >
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setCursor(undefined)
              setStack([])
              setSelected({})
              setApplied({ q: q.trim(), carrier: carrier.trim().toUpperCase(), status })
            }}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <Field label="Search">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="MBL, container…"
              />
            </Field>
            <Field label="Carrier">
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="SCAC"
              />
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Any</option>
                <option value="IN_TRANSIT">IN_TRANSIT</option>
                <option value="AT_PORT">AT_PORT</option>
                <option value="DELIVERED">DELIVERED</option>
                <option value="PENDING_INITIAL_REFRESH">PENDING_INITIAL_REFRESH</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Apply
              </Button>
            </div>
          </form>

          <form
            onSubmit={onRefreshMbl}
            className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]/60 p-3 sm:flex-row sm:items-end"
          >
            <div className="min-w-0 flex-1">
              <Field label="Refresh by MBL">
                <Input
                  value={mblInput}
                  onChange={(e) => setMblInput(e.target.value)}
                  placeholder="Shipment number — or paste several, comma/newline separated"
                />
              </Field>
            </div>
            <Button
              type="submit"
              className="w-full shrink-0 sm:w-auto"
              disabled={refreshByMbl.isPending}
            >
              {refreshByMbl.isPending ? 'Queueing…' : 'Refresh'}
            </Button>
          </form>
          {mblErr ? <ErrorBanner message={mblErr} /> : null}
          {mblMsg ? <p className="text-sm text-[var(--ok)]">{mblMsg}</p> : null}

          {(selectedCount > 0 || selectMsg || selectErr) && (
            <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--brand-soft)]/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-[var(--ink)]">
                {selectedCount} selected
                {selectedMbls.length !== selectedCount
                  ? ` · ${selectedMbls.length} unique MBL(s)`
                  : ''}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={!selectedMbls.length || refreshSelected.isPending}
                  onClick={() => refreshSelected.mutate(selectedMbls)}
                >
                  {refreshSelected.isPending
                    ? 'Queueing…'
                    : `Refresh selected (${selectedMbls.length})`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setSelected({})
                    setSelectMsg('')
                    setSelectErr('')
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
          {selectErr ? <ErrorBanner message={selectErr} /> : null}
          {selectMsg ? <p className="text-sm text-[var(--ok)]">{selectMsg}</p> : null}

          {listQuery.isError ? (
            <ErrorBanner
              message={
                listQuery.error instanceof ApiError
                  ? listQuery.error.message
                  : 'Failed to list hub shipments'
              }
            />
          ) : null}

          {listQuery.isLoading ? (
            <LoadingBlock label="Loading hub shipments…" />
          ) : items.length === 0 ? (
            <EmptyState title="No hub shipments" body="Connect hub in Settings if this looks wrong." />
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {items.map((row) => {
                  const checked = !!selected[row.id]
                  return (
                    <div
                      key={row.id}
                      className="flex gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]/40 p-3"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
                        checked={checked}
                        onChange={(e) => toggleRow(row, e.target.checked)}
                        aria-label={`Select ${rowMbl(row) || row.id}`}
                      />
                      <Link href={`/hub/shipments/${row.id}`} className="min-w-0 flex-1">
                        <p className="font-semibold text-[var(--brand)]">
                          {row.mbl || row.primary_reference || row.id.slice(0, 8)}
                        </p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {row.carrier_scac || '—'} · {row.container_number || '—'}
                        </p>
                        <div className="mt-2">
                          <Badge>{row.current_status || '—'}</Badge>
                        </div>
                      </Link>
                    </div>
                  )
                })}
              </div>

              <div className="hidden md:block">
                <Table>
                  <thead>
                    <tr>
                      <Th className="w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--brand)]"
                          checked={allOnPageSelected}
                          onChange={(e) => togglePage(e.target.checked)}
                          aria-label="Select all on page"
                        />
                      </Th>
                      <Th>Reference</Th>
                      <Th>Container</Th>
                      <Th>Carrier</Th>
                      <Th>Status</Th>
                      <Th>Updated</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id} className="hover:bg-[var(--elevate)]">
                        <Td>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--brand)]"
                            checked={!!selected[row.id]}
                            onChange={(e) => toggleRow(row, e.target.checked)}
                            aria-label={`Select ${rowMbl(row) || row.id}`}
                          />
                        </Td>
                        <Td>
                          <Link
                            href={`/hub/shipments/${row.id}`}
                            className="font-semibold text-[var(--brand)] hover:underline"
                          >
                            {row.mbl || row.primary_reference || row.id.slice(0, 8)}
                          </Link>
                        </Td>
                        <Td className="font-mono text-xs">{row.container_number || '—'}</Td>
                        <Td>{row.carrier_scac || '—'}</Td>
                        <Td>
                          <Badge>{row.current_status || '—'}</Badge>
                        </Td>
                        <Td className="text-xs text-[var(--muted)]">
                          {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!stack.length}
                  onClick={() => {
                    const next = [...stack]
                    const prev = next.pop()
                    setStack(next)
                    setCursor(prev)
                  }}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!listQuery.data?.next_cursor}
                  onClick={() => {
                    if (!listQuery.data?.next_cursor) return
                    setStack((s) => [...s, cursor])
                    setCursor(listQuery.data.next_cursor)
                  }}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* Secondary ops — compact 2-col on xl */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Webhook" description="Platform callback registration with hub.">
          <p className="text-sm">
            Status: <Badge>{webhookQuery.data?.status || '…'}</Badge>{' '}
            {webhookQuery.data?.callback_url ? (
              <span className="break-all text-[var(--muted)]">{webhookQuery.data.callback_url}</span>
            ) : null}
          </p>
          <Button
            type="button"
            className="mt-3 w-full sm:w-auto"
            variant="secondary"
            disabled={registerWh.isPending}
            onClick={() => registerWh.mutate()}
          >
            Register / refresh webhook
          </Button>
        </SectionCard>

        <SectionCard
          title="Refresh by lifecycle"
          description="Queue hub re-scrapes for all shipments in a status bucket."
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Status scope">
              <Select
                value={refreshScope}
                onChange={(e) => setRefreshScope(e.target.value as HubRefreshScope)}
              >
                {LIFECYCLE_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                {LIFECYCLE_SCOPES.find((s) => s.value === refreshScope)?.hint}
              </p>
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={refreshByStatus.isPending}
                onClick={() => refreshByStatus.mutate()}
              >
                {refreshByStatus.isPending ? 'Queueing…' : 'Queue refresh'}
              </Button>
            </div>
          </div>
          {lifecycleErr ? (
            <div className="mt-3">
              <ErrorBanner message={lifecycleErr} />
            </div>
          ) : null}
          {lifecycleMsg ? <p className="mt-3 text-sm text-[var(--ok)]">{lifecycleMsg}</p> : null}
        </SectionCard>

        <SectionCard
          title="Carriers"
          description={`${carriers.length} SCACs — select to queue hub refresh`}
        >
          {carriersQuery.isLoading ? (
            <LoadingBlock label="Loading carriers…" />
          ) : carriers.length ? (
            <div className="space-y-3">
              {(selectedCarrierList.length > 0 || carrierMsg || carrierErr) && (
                <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--brand-soft)]/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-[var(--ink)]">
                    {selectedCarrierList.length} SCAC
                    {selectedCarrierList.length === 1 ? '' : 's'} selected
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={!selectedCarrierList.length || refreshByCarrier.isPending}
                      onClick={() => refreshByCarrier.mutate(selectedCarrierList)}
                    >
                      {refreshByCarrier.isPending
                        ? 'Queueing…'
                        : `Refresh SCACs (${selectedCarrierList.length})`}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setSelectedScacs({})
                        setCarrierMsg('')
                        setCarrierErr('')
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
              {carrierErr ? <ErrorBanner message={carrierErr} /> : null}
              {carrierMsg ? <p className="text-sm text-[var(--ok)]">{carrierMsg}</p> : null}

              <div className="max-h-64 overflow-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th className="w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--brand)]"
                          checked={allCarriersSelected}
                          onChange={(e) => toggleAllCarriers(e.target.checked)}
                          aria-label="Select all SCACs"
                        />
                      </Th>
                      <Th>SCAC</Th>
                      <Th>Name</Th>
                      <Th className="text-right">Hub</Th>
                      <Th className="text-right">Refreshable</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {carriers.map((c) => {
                      const scac = c.scac.trim().toUpperCase()
                      return (
                        <tr key={c.scac} className="hover:bg-[var(--elevate)]">
                          <Td>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--brand)]"
                              checked={!!selectedScacs[scac]}
                              onChange={(e) => toggleScac(scac, e.target.checked)}
                              aria-label={`Select ${scac}`}
                            />
                          </Td>
                          <Td className="font-mono">{c.scac}</Td>
                          <Td>{c.name}</Td>
                          <Td className="text-right tabular-nums">{c.shipment_count}</Td>
                          <Td className="text-right tabular-nums text-[var(--muted)]">
                            {c.refreshable_count ?? '—'}
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>
            </div>
          ) : (
            <EmptyState title="No carriers" body="Carrier stats appear after hub is connected." />
          )}
        </SectionCard>

        <SectionCard title="Bulk purge / delete" description="Operate by MBL reference, one per line.">
          <Textarea
            rows={3}
            value={refs}
            onChange={(e) => setRefs(e.target.value)}
            placeholder="MBLs, one per line"
          />
          {bulkErr ? (
            <div className="mt-3">
              <ErrorBanner message={bulkErr} />
            </div>
          ) : null}
          {bulkMsg ? <p className="mt-3 text-sm text-[var(--ok)]">{bulkMsg}</p> : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => bulkMut.mutate('purge')}
            >
              Purge cache
            </Button>
            <Button
              type="button"
              variant="danger"
              className="w-full sm:w-auto"
              onClick={() => bulkMut.mutate('delete')}
            >
              Hard delete
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

export function HubRegisterPage() {
  const [, setLoc] = useLocation()
  const [mbl, setMbl] = useState('')
  const [scac, setScac] = useState('')
  const [containers, setContainers] = useState('')
  const [error, setError] = useState('')

  const mut = useMutation({
    mutationFn: () =>
      api.post<{ shipment_id: string }>(SA.hubShipments, {
        mbl,
        scac: scac || undefined,
        containers: containers
          .split(/[\s,]+/)
          .map((c) => c.trim())
          .filter(Boolean),
      }),
    onSuccess: (r) => setLoc(`/hub/shipments/${r.shipment_id}`),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Register failed'),
  })

  return (
    <div className="max-w-xl space-y-5">
      <Link href="/hub" className="text-sm font-semibold text-[var(--brand)] hover:underline">
        ← Hub
      </Link>
      <PageHeader
        title="Register hub shipment"
        description="Create a shipment on tracking-api via the backend proxy."
      />
      <SectionCard>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mut.mutate()
          }}
          className="space-y-4"
        >
          <Field label="MBL">
            <Input value={mbl} onChange={(e) => setMbl(e.target.value)} required />
          </Field>
          <Field label="SCAC">
            <Input value={scac} onChange={(e) => setScac(e.target.value)} />
          </Field>
          <Field label="Containers">
            <Textarea rows={3} value={containers} onChange={(e) => setContainers(e.target.value)} />
          </Field>
          {error ? <ErrorBanner message={error} /> : null}
          <Button type="submit" className="w-full sm:w-auto" disabled={mut.isPending}>
            {mut.isPending ? 'Registering…' : 'Register'}
          </Button>
        </form>
      </SectionCard>
    </div>
  )
}

export function HubShipmentDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id || ''
  const [, setLoc] = useLocation()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [refreshErr, setRefreshErr] = useState('')
  const [form, setForm] = useState({
    mbl: '',
    container_number: '',
    current_status: '',
    vessel_name: '',
    scac: '',
  })

  const query = useQuery({
    queryKey: ['hub-shipment', id],
    queryFn: () =>
      api.get<{
        shipment: Record<string, unknown>
        identities: { reference_type: string; reference_value: string }[]
        carrier_scac?: string
        timeline?: { type?: string; occurred_at?: string; location_name?: string; source?: string }[]
      }>(`${SA.hubShipment(id)}?include=timeline`),
    enabled: !!id,
  })

  useEffect(() => {
    const s = query.data?.shipment
    if (!s) return
    setForm({
      mbl: String(s.mbl || ''),
      container_number: String(s.container_number || ''),
      current_status: String(s.current_status || ''),
      vessel_name: String(s.vessel_name || ''),
      scac: String(query.data?.carrier_scac || ''),
    })
  }, [query.data])

  const saveMut = useMutation({
    mutationFn: () => api.patch(SA.hubShipment(id), form),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['hub-shipment', id] }),
  })

  const delMut = useMutation({
    mutationFn: () => api.delete(SA.hubShipment(id)),
    onSuccess: () => setLoc('/hub'),
  })

  const refreshMut = useMutation({
    mutationFn: () => {
      const mbl = form.mbl.trim().toUpperCase()
      if (!mbl) throw new Error('MBL is required to refresh tracking')
      return queueMblRefresh([mbl])
    },
    onSuccess: (r) => {
      setRefreshMsg(formatRefreshResult(r))
      setRefreshErr('')
    },
    onError: (e) => {
      setRefreshErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Refresh failed')
      setRefreshMsg('')
    },
  })

  if (query.isLoading) return <LoadingBlock label="Loading shipment…" />
  if (query.isError || !query.data) {
    return (
      <ErrorBanner
        message={query.error instanceof ApiError ? query.error.message : 'Not found'}
      />
    )
  }

  return (
    <div className="space-y-5">
      <Link href="/hub" className="text-sm font-semibold text-[var(--brand)] hover:underline">
        ← Hub
      </Link>
      <PageHeader
        title={form.mbl || id}
        description="Edit hub shipment fields and review identities."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={refreshMut.isPending || !form.mbl.trim()}
              onClick={() => refreshMut.mutate()}
            >
              {refreshMut.isPending ? 'Queueing…' : 'Refresh tracking'}
            </Button>
            <Button
              type="button"
              variant="danger"
              className="w-full sm:w-auto"
              onClick={() => setConfirm(true)}
            >
              Delete
            </Button>
          </div>
        }
      />

      {refreshErr ? <ErrorBanner message={refreshErr} /> : null}
      {refreshMsg ? <p className="text-sm text-[var(--ok)]">{refreshMsg}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Details">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              saveMut.mutate()
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            {(
              [
                ['mbl', 'MBL'],
                ['container_number', 'Container'],
                ['scac', 'SCAC'],
                ['current_status', 'Status'],
                ['vessel_name', 'Vessel'],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                />
              </Field>
            ))}
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full sm:w-auto" disabled={saveMut.isPending}>
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Identities">
          <Table>
            <thead>
              <tr>
                <Th>Identity type</Th>
                <Th>Value</Th>
              </tr>
            </thead>
            <tbody>
              {(query.data.identities || []).map((i) => (
                <tr key={`${i.reference_type}:${i.reference_value}`}>
                  <Td>{i.reference_type}</Td>
                  <Td className="font-mono text-xs">{i.reference_value}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>
      </div>

      <Dialog
        open={confirm}
        title="Delete hub shipment?"
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" type="button" onClick={() => delMut.mutate()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--muted)]">Hard-deletes this shipment on the hub.</p>
      </Dialog>
    </div>
  )
}
