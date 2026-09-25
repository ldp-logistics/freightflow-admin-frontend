import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, SA, unwrapList } from '../lib/api'
import { normalizeOrg, pick, pickStr, unwrapPagination, type NormalizedOrg } from '../lib/normalize'
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
  Checkbox,
} from '../components/ui'

type SharedRow = Record<string, unknown>

type LinkedOrg = {
  orgId: string
  orgName: string
}

function sharedShipmentId(row: SharedRow): string {
  return pickStr(row, 'shipmentId', 'shipment_id')
}

function parseLinkedOrgs(row: SharedRow): LinkedOrg[] {
  const raw = pick<unknown[]>(row, 'linkedOrgs', 'linked_orgs')
  if (!Array.isArray(raw)) return []
  return raw.map((item) => ({
    orgId: pickStr(item, 'orgId', 'org_id'),
    orgName: pickStr(item, 'orgName', 'org_name', '—'),
  }))
}

function trimOrUndef(v: string): string | undefined {
  const t = v.trim()
  return t || undefined
}

export function PlatformShipmentsPage() {
  const qc = useQueryClient()

  const [targetOrgId, setTargetOrgId] = useState('')
  const [officeId, setOfficeId] = useState('')
  const [hideLinked, setHideLinked] = useState(true)
  const [page, setPage] = useState(1)

  const [mbl, setMbl] = useState('')
  const [container, setContainer] = useState('')
  const [scac, setScac] = useState('')
  const [status, setStatus] = useState('')
  const [applied, setApplied] = useState({ mbl: '', container: '', scac: '', status: '' })

  const [platformSearch, setPlatformSearch] = useState('')
  const [platformApplied, setPlatformApplied] = useState('')

  const [selected, setSelected] = useState<Record<string, SharedRow>>({})
  const [assignOpen, setAssignOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const orgsQuery = useQuery({
    queryKey: ['platform-assign-orgs'],
    queryFn: async () => {
      const payload = await api.get(`${SA.orgs}?approved=true&page_size=50`)
      return unwrapList<unknown>(payload).map(normalizeOrg)
    },
  })
  const orgs: NormalizedOrg[] = orgsQuery.data ?? []

  const officesQuery = useQuery({
    queryKey: ['platform-assign-offices', targetOrgId],
    queryFn: async () => unwrapList<{ id?: number; name?: string; is_active?: boolean }>(
      await api.get(SA.orgOffices(targetOrgId)),
    ),
    enabled: !!targetOrgId,
  })
  const offices = (officesQuery.data ?? []).filter(
    (o) => o.is_active !== false && o.id != null,
  )

  const searchBody = useMemo(() => {
    const body: Record<string, unknown> = {
      page,
      page_size: 25,
      shipment: {
        mbl: trimOrUndef(applied.mbl),
        container: trimOrUndef(applied.container),
        scac: trimOrUndef(applied.scac),
        status: trimOrUndef(applied.status),
      },
      source: {},
      custom_fields: [],
    }
    if (targetOrgId) {
      body.target_org_id = targetOrgId
      if (hideLinked) body.unlinked_to_org_id = targetOrgId
    }
    return body
  }, [page, applied, targetOrgId, hideLinked])

  const sharedQuery = useQuery({
    queryKey: ['platform-shared-shipments', searchBody],
    queryFn: async () => {
      const payload = await api.post<unknown>(SA.sharedShipmentsSearch, searchBody)
      return {
        rows: unwrapList<SharedRow>(payload),
        pagination: unwrapPagination(payload),
      }
    },
  })

  const platformQuery = useQuery({
    queryKey: ['platform-shipments-inventory', platformApplied],
    queryFn: async () => {
      const qs = platformApplied ? `?search=${encodeURIComponent(platformApplied)}` : ''
      return unwrapList<SharedRow>(await api.get(`${SA.shipments}${qs}`))
    },
  })

  const assignMut = useMutation({
    mutationFn: () => {
      const shipment_ids = Object.keys(selected)
      return api.post<{ created?: number; already_linked?: number; total?: number }>(
        SA.bulkAssign,
        {
          target_org_id: targetOrgId,
          shipment_ids,
          office_id: officeId ? Number(officeId) : undefined,
        },
      )
    },
    onSuccess: (r) => {
      setMsg(
        `Assigned — created ${r.created ?? 0}, already linked ${r.already_linked ?? 0} of ${r.total ?? 0}`,
      )
      setError('')
      setSelected({})
      setAssignOpen(false)
      void qc.invalidateQueries({ queryKey: ['platform-shared-shipments'] })
      void qc.invalidateQueries({ queryKey: ['platform-shipments-inventory'] })
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Assign failed')
      setMsg('')
    },
  })

  const rows = sharedQuery.data?.rows ?? []
  const pagination = sharedQuery.data?.pagination
  const selectedCount = Object.keys(selected).length
  const targetOrgName = orgs.find((o) => o.id === targetOrgId)?.name ?? targetOrgId

  function onFilterSearch(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setSelected({})
    setApplied({
      mbl: mbl.trim(),
      container: container.trim(),
      scac: scac.trim(),
      status: status.trim(),
    })
  }

  function onPlatformSearch(e: FormEvent) {
    e.preventDefault()
    setPlatformApplied(platformSearch.trim())
  }

  function toggleRow(row: SharedRow, checked: boolean) {
    const id = sharedShipmentId(row)
    if (!id) return
    setSelected((prev) => {
      const next = { ...prev }
      if (checked) next[id] = row
      else delete next[id]
      return next
    })
  }

  const allOnPageSelected =
    rows.length > 0 && rows.every((r) => !!selected[sharedShipmentId(r)])

  function togglePage(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev }
      for (const row of rows) {
        const id = sharedShipmentId(row)
        if (!id) continue
        if (checked) next[id] = row
        else delete next[id]
      }
      return next
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shipments"
        description="Search shared inventory, select rows, and bulk-assign to an organization."
      />

      <SectionCard title="Destination" description="Target org for search hints and bulk assign.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Target organization">
            <Select
              value={targetOrgId}
              onChange={(e) => {
                setTargetOrgId(e.target.value)
                setOfficeId('')
                setSelected({})
              }}
            >
              <option value="">None (browse all)</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Office (optional)">
            <Select
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
              disabled={!targetOrgId}
            >
              <option value="">No office</option>
              {offices.map((o) => (
                <option key={o.id} value={String(o.id)}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Checkbox
              checked={hideLinked}
              onChange={setHideLinked}
              label="Hide already linked to target"
            />
          </div>
        </div>
        {orgsQuery.isError ? (
          <div className="mt-3">
            <ErrorBanner
              message={
                orgsQuery.error instanceof ApiError ? orgsQuery.error.message : 'Failed to load orgs'
              }
            />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Search shared shipments">
        <form onSubmit={onFilterSearch} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="MBL">
            <Input value={mbl} onChange={(e) => setMbl(e.target.value)} placeholder="MBL" />
          </Field>
          <Field label="Container">
            <Input
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              placeholder="Container #"
            />
          </Field>
          <Field label="SCAC">
            <Input value={scac} onChange={(e) => setScac(e.target.value)} placeholder="SCAC" />
          </Field>
          <Field label="Status">
            <Input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Status" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Search
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Shared inventory"
        description={
          pagination
            ? `${pagination.total} match · page ${pagination.page} of ${pagination.totalPages || 1}`
            : undefined
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={!targetOrgId || selectedCount === 0 || selectedCount > 100}
            onClick={() => {
              setError('')
              setMsg('')
              setAssignOpen(true)
            }}
          >
            Bulk assign{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </Button>
          {selectedCount > 100 ? (
            <p className="text-xs text-[var(--danger)]">Maximum 100 shipments per assignment.</p>
          ) : null}
          {selectedCount > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setSelected({})}>
              Clear selection
            </Button>
          ) : null}
          {msg ? <p className="text-sm text-[var(--ok)]">{msg}</p> : null}
        </div>

        {sharedQuery.isError ? (
          <ErrorBanner
            message={
              sharedQuery.error instanceof ApiError ? sharedQuery.error.message : 'Search failed'
            }
          />
        ) : null}

        {sharedQuery.isLoading ? (
          <LoadingBlock label="Searching shared shipments…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No shipments" body="Adjust filters or clear the target org filter." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--line)] accent-[var(--brand)]"
                      checked={allOnPageSelected}
                      onChange={(e) => togglePage(e.target.checked)}
                      aria-label="Select all on page"
                    />
                  </Th>
                  <Th>MBL</Th>
                  <Th>SCAC</Th>
                  <Th>Status</Th>
                  <Th>Linked orgs</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = sharedShipmentId(row)
                  const linked = parseLinkedOrgs(row)
                  return (
                    <tr key={id || pickStr(row, 'mbl', 'mbl')} className="hover:bg-[var(--elevate)]">
                      <Td>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-[var(--line)] accent-[var(--brand)]"
                          checked={!!id && !!selected[id]}
                          disabled={!id}
                          onChange={(e) => toggleRow(row, e.target.checked)}
                          aria-label={`Select ${pickStr(row, 'mbl', 'mbl')}`}
                        />
                      </Td>
                      <Td className="font-semibold">{pickStr(row, 'mbl', 'mbl', '—')}</Td>
                      <Td className="font-mono text-xs">{pickStr(row, 'scac', 'scac', '—')}</Td>
                      <Td>
                        <Badge>{pickStr(row, 'status', 'status', '—')}</Badge>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {linked.length === 0 ? (
                            <span className="text-xs text-[var(--muted)]">Unlinked</span>
                          ) : (
                            linked.map((org) => (
                              <Badge key={org.orgId || org.orgName} tone="brand">
                                {org.orgName}
                              </Badge>
                            ))
                          )}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
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

      <SectionCard title="Platform inventory" description="Simple superadmin shipment list fallback.">
        <form onSubmit={onPlatformSearch} className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Search">
              <Input
                value={platformSearch}
                onChange={(e) => setPlatformSearch(e.target.value)}
                placeholder="Search by MBL or reference"
              />
            </Field>
          </div>
          <Button type="submit" className="w-full sm:w-auto">
            Search
          </Button>
        </form>
        {platformQuery.isLoading ? (
          <LoadingBlock label="Loading platform shipments…" />
        ) : (platformQuery.data?.length ?? 0) === 0 ? (
          <EmptyState title="No rows" body="Try a search term or leave empty for recent list." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>MBL</Th>
                <Th>Status</Th>
                <Th>Org</Th>
                <Th>Shipment ID</Th>
              </tr>
            </thead>
            <tbody>
              {(platformQuery.data ?? []).map((r) => {
                const sid = sharedShipmentId(r) || pickStr(r, 'id', 'id')
                return (
                  <tr key={sid || pickStr(r, 'mbl', 'mbl')} className="hover:bg-[var(--elevate)]">
                    <Td className="font-semibold">{pickStr(r, 'mbl', 'mbl', '—')}</Td>
                    <Td>
                      {pickStr(r, 'status', 'status') ||
                        pickStr(r, 'currentStatus', 'current_status', '—')}
                    </Td>
                    <Td>
                      {pickStr(r, 'orgName', 'org_name') ||
                        pickStr(r, 'organizationName', 'organization_name', '—')}
                    </Td>
                    <Td className="font-mono text-xs">
                      {sid ? `${sid.slice(0, 8)}…` : '—'}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>

      <Dialog
        open={assignOpen}
        title="Confirm bulk assign"
        onClose={() => setAssignOpen(false)}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={assignMut.isPending}
              onClick={() => assignMut.mutate()}
            >
              {assignMut.isPending ? 'Assigning…' : 'Confirm'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--muted)]">
          Link {selectedCount} shipment{selectedCount === 1 ? '' : 's'} to{' '}
          <strong>{targetOrgName || 'target org'}</strong>
          {officeId
            ? ` (office ${offices.find((o) => String(o.id) === officeId)?.name ?? officeId})`
            : ''}
          .
        </p>
        {error ? (
          <div className="mt-3">
            <ErrorBanner message={error} />
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
