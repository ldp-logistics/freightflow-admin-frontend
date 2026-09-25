import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams, useSearchParams } from 'wouter'
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
  Table,
  Td,
  Th,
} from '../components/ui'
import {
  eventSortKey,
  formatDate,
  formatDt,
  type OrgShipmentDetail,
  type ShipmentContainer,
  type ShipmentSourceDetails,
} from '../types/shipments'

function Flag({ on, label }: { on?: boolean; label: string }) {
  if (!on) return null
  return <Badge tone="brand">{label}</Badge>
}

function SourcePanel({ details }: { details: ShipmentSourceDetails | null | undefined }) {
  if (!details) {
    return <EmptyState title="No source payload" body="No TAI/CSV/API intake attached to this selection." />
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge>{details.source_type}</Badge>
        {details.source_ref ? (
          <span className="font-mono text-xs text-[var(--muted)]">{details.source_ref}</span>
        ) : null}
        {details.received_at ? (
          <span className="text-xs text-[var(--muted)]">{formatDt(details.received_at)}</span>
        ) : null}
      </div>
      {details.extracted && Object.keys(details.extracted).length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Extracted
          </p>
          <pre className="max-h-64 overflow-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 text-xs">
            {JSON.stringify(details.extracted, null, 2)}
          </pre>
        </div>
      ) : null}
      {details.raw_payload ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Raw payload
          </p>
          <pre className="max-h-80 overflow-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 text-xs">
            {JSON.stringify(details.raw_payload, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

function ContainerSummary({ container }: { container: ShipmentContainer }) {
  const rows: [string, string][] = [
    ['Status', container.status?.replace(/_/g, ' ') || '—'],
    ['Size / type', [container.container_size, container.container_type].filter(Boolean).join(' · ') || '—'],
    ['Location', container.current_location_name || '—'],
    ['Origin', container.origin_name || '—'],
    ['Destination', container.destination_name || '—'],
    ['Vessel', container.vessel_name || '—'],
    ['Voyage', container.voyage_number || '—'],
    ['ETA', formatDt(container.eta)],
    ['ATA', formatDt(container.ata)],
    ['LFD', formatDate(container.lfd)],
    ['LRD', formatDate(container.lrd)],
    ['RFD', formatDate(container.rfd)],
    ['TAI shipment id', container.tai_shipment_id || '—'],
  ]
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{k}</dt>
          <dd className="mt-0.5 text-sm font-medium break-all">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function EventsTable({ container }: { container: ShipmentContainer }) {
  const events = useMemo(
    () => [...(container.events || [])].sort((a, b) => eventSortKey(a) - eventSortKey(b)),
    [container.events],
  )
  if (!events.length) {
    return <EmptyState title="No events" body="Tracking events appear after hub sync." />
  }
  return (
    <>
      <div className="space-y-2 md:hidden">
        {events.map((e, i) => (
          <div
            key={`${e.code}-${e.actual_time || e.estimate_time}-${i}`}
            className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]/50 p-3"
          >
            <p className="font-semibold">{e.name || e.code || 'Event'}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {e.actual_time ? `Actual ${formatDt(e.actual_time)}` : `Est. ${formatDt(e.estimate_time)}`}
            </p>
            <p className="mt-1 text-sm">{e.location || e.location_code || '—'}</p>
            {e.transport_mode || e.transport_name ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                {[e.transport_mode, e.transport_name, e.trip_number].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              <Th>Event</Th>
              <Th>Time</Th>
              <Th>Location</Th>
              <Th>Transport</Th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={`${e.code}-${e.actual_time || e.estimate_time}-${i}`} className="hover:bg-[var(--elevate)]">
                <Td>
                  <div className="font-medium">{e.name || '—'}</div>
                  <div className="font-mono text-xs text-[var(--muted)]">{e.code || ''}</div>
                </Td>
                <Td className="text-xs">
                  {e.actual_time ? (
                    <span>{formatDt(e.actual_time)}</span>
                  ) : (
                    <span className="text-[var(--muted)]">est {formatDt(e.estimate_time)}</span>
                  )}
                </Td>
                <Td>{e.location || e.location_code || '—'}</Td>
                <Td className="text-xs text-[var(--muted)]">
                  {[e.transport_mode, e.transport_name, e.trip_number].filter(Boolean).join(' · ') ||
                    '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  )
}

export function PlatformShipmentDetailPage() {
  const params = useParams<{ id: string }>()
  const shipmentId = params.id || ''
  const [search] = useSearchParams()
  const orgId = search.get('org') || search.get('org_id') || ''
  const containerFromQuery = search.get('container') || search.get('containerId') || ''
  const [, setLoc] = useLocation()
  const qc = useQueryClient()

  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'events' | 'source'>('overview')
  const [datesOpen, setDatesOpen] = useState(false)
  const [lfd, setLfd] = useState('')
  const [lrd, setLrd] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const detailPath = useMemo(() => {
    const qs = orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''
    return `${SA.shipment(shipmentId)}${qs}`
  }, [shipmentId, orgId])

  const query = useQuery({
    queryKey: ['platform-shipment', shipmentId, orgId || null],
    queryFn: () => api.get<OrgShipmentDetail>(detailPath),
    enabled: !!shipmentId,
  })

  const shipment = query.data
  const containers = shipment?.containers ?? []

  useEffect(() => {
    if (!containers.length) {
      setSelectedContainerId(null)
      return
    }
    const fromQuery = containerFromQuery
      ? containers.find((c) => c.id === containerFromQuery)
      : undefined
    setSelectedContainerId((prev) => {
      if (fromQuery) return fromQuery.id
      if (prev && containers.some((c) => c.id === prev)) return prev
      return containers[0].id
    })
  }, [containers, containerFromQuery])

  const selected =
    containers.find((c) => c.id === selectedContainerId) ?? containers[0] ?? null

  const sourceDetails =
    selected?.source_details ?? shipment?.source_details ?? null

  const syncMut = useMutation({
    mutationFn: () => {
      const qs = orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''
      return api.post<OrgShipmentDetail>(`${SA.shipmentSyncFromHub(shipmentId)}${qs}`)
    },
    onSuccess: () => {
      setMsg('Sync complete — latest hub data pulled.')
      setError('')
      void qc.invalidateQueries({ queryKey: ['platform-shipment', shipmentId] })
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Sync failed')
      setMsg('')
    },
  })

  const datesMut = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('No container selected')
      const body: { lfd?: string; lrd?: string } = {}
      if (lfd.trim()) body.lfd = new Date(lfd).toISOString()
      if (lrd.trim()) body.lrd = new Date(lrd).toISOString()
      if (!body.lfd && !body.lrd) throw new Error('Provide LFD and/or LRD')
      return api.patch(SA.containerDates(selected.id), body)
    },
    onSuccess: () => {
      setDatesOpen(false)
      setMsg('Container dates updated.')
      setError('')
      void qc.invalidateQueries({ queryKey: ['platform-shipment', shipmentId] })
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Update failed')
    },
  })

  function openDates() {
    if (!selected) return
    setLfd(selected.lfd ? selected.lfd.slice(0, 10) : '')
    setLrd(selected.lrd ? selected.lrd.slice(0, 10) : '')
    setDatesOpen(true)
  }

  if (query.isLoading) return <LoadingBlock label="Loading shipment…" />
  if (query.isError || !shipment) {
    return (
      <div className="space-y-4">
        <Link href="/shipments" className="text-sm font-semibold text-[var(--brand)] hover:underline">
          ← Shipments
        </Link>
        <ErrorBanner
          message={query.error instanceof ApiError ? query.error.message : 'Shipment not found'}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Link href="/shipments" className="text-sm font-semibold text-[var(--brand)] hover:underline">
        ← Shipments
      </Link>

      <PageHeader
        title={shipment.mbl}
        description={[
          shipment.scac ? `SCAC ${shipment.scac}` : null,
          shipment.status?.replace(/_/g, ' '),
          `${shipment.container_count} container(s)`,
          shipment.tracking_updated_at
            ? `Updated ${formatDt(shipment.tracking_updated_at)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={syncMut.isPending}
              onClick={() => syncMut.mutate()}
            >
              {syncMut.isPending ? 'Syncing…' : 'Sync from hub'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => setLoc(`/containers?search=${encodeURIComponent(shipment.mbl)}`)}
            >
              Containers list
            </Button>
          </div>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}
      {msg ? <p className="text-sm text-[var(--ok)]">{msg}</p> : null}

      <SectionCard title="Shipment">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['MBL', shipment.mbl],
              ['Booking', shipment.booking_number || '—'],
              ['Source', shipment.source_type || '—'],
              ['Source ref', shipment.source_ref || shipment.tai_shipment_id || '—'],
              ['Archived', shipment.is_archived ? 'Yes' : 'No'],
              ['Archive reason', shipment.archive_reason || '—'],
              ['Office id', shipment.office_id != null ? String(shipment.office_id) : '—'],
              ['Shipment id', shipment.shipment_id],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{k}</dt>
              <dd className="mt-0.5 break-all text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {shipment.custom_fields && Object.keys(shipment.custom_fields).length > 0 ? (
          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Custom fields
            </p>
            <pre className="max-h-40 overflow-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 text-xs">
              {JSON.stringify(shipment.custom_fields, null, 2)}
            </pre>
          </div>
        ) : null}
      </SectionCard>

      {containers.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {containers.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant={selected?.id === c.id ? 'primary' : 'secondary'}
              className="font-mono !px-3 !py-1.5 text-xs"
              onClick={() => setSelectedContainerId(c.id)}
            >
              {c.container_number}
              {c.tai_shipment_id ? (
                <span className="ml-2 font-sans text-[10px] opacity-70 normal-case">
                  TAI {c.tai_shipment_id}
                </span>
              ) : null}
            </Button>
          ))}
        </div>
      ) : null}

      {!selected ? (
        <EmptyState title="No containers" body="This shipment has no container rows yet." />
      ) : (
        <>
          <SectionCard
            title={selected.container_number}
            description={selected.status?.replace(/_/g, ' ') || 'Container'}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Flag on={selected.is_rail_shipment} label="Rail" />
                <Flag on={selected.is_in_transit} label="In transit" />
                <Flag on={selected.is_at_port} label="At port" />
                <Flag on={selected.is_on_rail} label="On rail" />
                <Flag on={selected.is_lfd_needed} label="LFD needed" />
                <Flag on={selected.is_lrd_needed} label="LRD needed" />
                <Flag on={selected.is_completed} label="Completed" />
              </div>
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={openDates}>
                Edit LFD / LRD
              </Button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 border-b border-[var(--line)] pb-3">
              {(
                [
                  ['overview', 'Overview'],
                  ['events', 'Events'],
                  ['source', 'Source / TAI'],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  variant={tab === id ? 'primary' : 'ghost'}
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => setTab(id)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {tab === 'overview' ? <ContainerSummary container={selected} /> : null}
            {tab === 'events' ? <EventsTable container={selected} /> : null}
            {tab === 'source' ? <SourcePanel details={sourceDetails} /> : null}
          </SectionCard>
        </>
      )}

      <Dialog
        open={datesOpen}
        title="Edit container dates"
        onClose={() => setDatesOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDatesOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={datesMut.isPending}
              onClick={() => datesMut.mutate()}
            >
              {datesMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            datesMut.mutate()
          }}
        >
          <Field label="LFD">
            <Input type="date" value={lfd} onChange={(e) => setLfd(e.target.value)} />
          </Field>
          <Field label="LRD">
            <Input type="date" value={lrd} onChange={(e) => setLrd(e.target.value)} />
          </Field>
        </form>
      </Dialog>
    </div>
  )
}
