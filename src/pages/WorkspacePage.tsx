import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearch } from 'wouter'
import {
  Badge,
  Button,
  Checkbox,
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
import { api, ApiError, SA, unwrapList } from '../lib/api'
import {
  asRecord,
  normalizeOrg,
  orgIsApproved,
  orgKindLabel,
  pick,
  pickBool,
  pickStr,
  unwrapPagination,
} from '../lib/normalize'

type WorkspaceTab =
  | 'members'
  | 'offices'
  | 'shipments'
  | 'fields'
  | 'connections'
  | 'customers'
  | 'routing'

type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

const ORG_PAGE_SIZE = 50
const SHIPMENT_PAGE_SIZE = 25

const TAB_LABELS: { id: WorkspaceTab; label: string }[] = [
  { id: 'members', label: 'Members' },
  { id: 'offices', label: 'Offices' },
  { id: 'shipments', label: 'Shipments' },
  { id: 'fields', label: 'Fields' },
  { id: 'connections', label: 'Connections' },
  { id: 'customers', label: 'Customers' },
  { id: 'routing', label: 'Routing' },
]

function unwrapMembers(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const r = asRecord(payload)
  for (const key of ['members', 'data', 'items'] as const) {
    const v = r[key]
    if (Array.isArray(v)) return v
  }
  return []
}

function memberUserId(row: unknown): string {
  return pickStr(row, 'userId', 'user_id')
}

function rowId(row: unknown): string {
  return pickStr(row, 'id', 'id')
}

function SubTabBar({
  active,
  onChange,
}: {
  active: WorkspaceTab
  onChange: (tab: WorkspaceTab) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TAB_LABELS.map((t) => (
        <Button
          key={t.id}
          type="button"
          variant={active === t.id ? 'primary' : 'secondary'}
          className="!py-1.5 !text-xs capitalize"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </Button>
      ))}
    </div>
  )
}

function MembersTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('MEMBER')
  const [inviteName, setInviteName] = useState('')
  const [inviteCompliance, setInviteCompliance] = useState(false)
  const [inviteManualEntry, setInviteManualEntry] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | OrgRole>('all')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const pageSize = 25

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [roleFilter, orgId])

  const query = useQuery({
    queryKey: ['workspace-members', orgId, page, debouncedSearch, roleFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        pageSize: String(pageSize),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (roleFilter !== 'all') params.set('role', roleFilter)
      const payload = await api.get(`${SA.orgMembers(orgId)}?${params}`)
      return {
        members: unwrapMembers(payload),
        pagination: unwrapPagination(payload),
      }
    },
    enabled: !!orgId,
  })

  const inviteMut = useMutation({
    mutationFn: () =>
      api.post(SA.orgInvites(orgId), {
        email: inviteEmail.trim(),
        role: inviteRole,
        name: inviteName.trim() || undefined,
        isComplianceUser: inviteCompliance,
        isManualEntry: inviteManualEntry,
      }),
    onSuccess: () => {
      setInviteEmail('')
      setInviteName('')
      setInviteCompliance(false)
      setInviteManualEntry(false)
      setError('')
      void qc.invalidateQueries({ queryKey: ['workspace-members', orgId] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Invite failed'),
  })

  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) =>
      api.patch(SA.orgMember(orgId, userId), { role }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace-members', orgId] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Role update failed'),
  })

  const removeMut = useMutation({
    mutationFn: (userId: string) => api.delete(SA.orgMember(orgId, userId)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace-members', orgId] }),
  })

  const members = query.data?.members || []
  const pagination = query.data?.pagination || {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  }
  const totalPages = Math.max(1, pagination.totalPages)

  return (
    <div className="space-y-6">
      {query.isError ? (
        <ErrorBanner
          message={
            query.error instanceof ApiError ? query.error.message : 'Failed to load members'
          }
        />
      ) : null}

      <SectionCard title="Invite member" description="Sends an email invite with OTP.">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setError('')
            inviteMut.mutate()
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_1fr_auto]">
            <Field label="Email">
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Role">
              <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)}>
                <option value="OWNER">OWNER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="MEMBER">MEMBER</option>
                <option value="VIEWER">VIEWER</option>
              </Select>
            </Field>
            <Field label="Name (optional)">
              <Textarea
                rows={1}
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Display name"
              />
            </Field>
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <Button type="submit" disabled={inviteMut.isPending} className="w-full lg:w-auto">
                {inviteMut.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Checkbox
              label="Compliance user"
              checked={inviteCompliance}
              onChange={setInviteCompliance}
            />
            <Checkbox
              label="Manual LFD/LRD entry"
              checked={inviteManualEntry}
              onChange={setInviteManualEntry}
            />
          </div>
        </form>
        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Members"
        description={
          pagination.total
            ? `Page ${pagination.page} of ${totalPages} · ${pagination.total} total`
            : undefined
        }
      >
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Field label="Search">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email"
            />
          </Field>
          <Field label="Role">
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'all' | OrgRole)}
            >
              <option value="all">All roles</option>
              <option value="OWNER">OWNER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="MEMBER">MEMBER</option>
              <option value="VIEWER">VIEWER</option>
            </Select>
          </Field>
        </div>
        {query.isLoading ? (
          <LoadingBlock label="Loading members…" />
        ) : members.length === 0 ? (
          <EmptyState title="No members" body="Invite someone to join this organization." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((raw) => {
                  const userId = memberUserId(raw)
                  const email = pickStr(raw, 'email', 'email')
                  const name = pickStr(raw, 'name', 'name') || '—'
                  const role = (pickStr(raw, 'role', 'role') || 'MEMBER').toUpperCase() as OrgRole
                  return (
                    <tr key={userId || email} className="hover:bg-[var(--elevate)]">
                      <Td className="font-semibold">{email}</Td>
                      <Td>{name}</Td>
                      <Td>
                        <Select
                          value={role}
                          className="!py-1.5 !text-xs"
                          disabled={!userId || roleMut.isPending}
                          onChange={(e) => {
                            if (!userId) return
                            setError('')
                            roleMut.mutate({ userId, role: e.target.value as OrgRole })
                          }}
                        >
                          <option value="OWNER">OWNER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="MEMBER">MEMBER</option>
                          <option value="VIEWER">VIEWER</option>
                        </Select>
                      </Td>
                      <Td>
                        <Button
                          type="button"
                          variant="danger"
                          className="!py-1.5 !text-xs"
                          disabled={!userId || removeMut.isPending}
                          onClick={() => userId && removeMut.mutate(userId)}
                        >
                          Remove
                        </Button>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[var(--muted)]">
                Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(pagination.page * pagination.pageSize, pagination.total || 0)} of{' '}
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

function OfficesTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const query = useQuery({
    queryKey: ['workspace-offices', orgId],
    queryFn: async () => unwrapList<unknown>(await api.get(SA.orgOffices(orgId))),
    enabled: !!orgId,
  })

  const createMut = useMutation({
    mutationFn: () =>
      api.post(SA.orgOffices(orgId), {
        name: name.trim(),
        code: code.trim(),
      }),
    onSuccess: () => {
      setName('')
      setCode('')
      setError('')
      void qc.invalidateQueries({ queryKey: ['workspace-offices', orgId] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Create failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (officeId: number) => api.delete(SA.orgOffice(orgId, officeId)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace-offices', orgId] }),
  })

  const offices = query.data || []

  return (
    <div className="space-y-6">
      {query.isError ? (
        <ErrorBanner
          message={
            query.error instanceof ApiError ? query.error.message : 'Failed to load offices'
          }
        />
      ) : null}

      <SectionCard title="Create office">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setError('')
            createMut.mutate()
          }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Code">
            <Input value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Add office'}
            </Button>
          </div>
        </form>
        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Offices">
        {query.isLoading ? (
          <LoadingBlock label="Loading offices…" />
        ) : offices.length === 0 ? (
          <EmptyState title="No offices" body="Create an office for this internal organization." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {offices.map((raw) => {
                const id = Number(pick(raw, 'id', 'id'))
                return (
                  <tr key={String(id)} className="hover:bg-[var(--elevate)]">
                    <Td>{pickStr(raw, 'name', 'name')}</Td>
                    <Td>{pickStr(raw, 'code', 'code')}</Td>
                    <Td>
                      <Button
                        type="button"
                        variant="danger"
                        className="!py-1.5 !text-xs"
                        disabled={!id || deleteMut.isPending}
                        onClick={() => id && deleteMut.mutate(id)}
                      >
                        Delete
                      </Button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

function ShipmentsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const [mbl, setMbl] = useState('')
  const [scac, setScac] = useState('')
  const [error, setError] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importOfficeId, setImportOfficeId] = useState('')
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')

  const query = useQuery({
    queryKey: ['workspace-shipments', orgId],
    queryFn: async () => {
      const payload = await api.get(
        `${SA.orgShipments(orgId)}?page=1&page_size=${SHIPMENT_PAGE_SIZE}`,
      )
      return {
        rows: unwrapList<unknown>(payload),
        pagination: unwrapPagination(payload),
      }
    },
    enabled: !!orgId,
  })

  const officesQuery = useQuery({
    queryKey: ['workspace-import-offices', orgId],
    queryFn: async () =>
      unwrapList<unknown>(await api.get(SA.orgOffices(orgId))).map((raw) => {
        const r = asRecord(raw)
        return {
          id: Number(r.id ?? 0),
          name: pickStr(raw, 'name', 'name') || `Office #${r.id}`,
          isActive: pickBool(raw, 'isActive', 'is_active', true),
        }
      }),
    enabled: !!orgId,
  })

  const createMut = useMutation({
    mutationFn: () =>
      api.post(SA.orgShipmentCreate(orgId), {
        mbl: mbl.trim(),
        scac: scac.trim() || undefined,
      }),
    onSuccess: () => {
      setMbl('')
      setScac('')
      setError('')
      void qc.invalidateQueries({ queryKey: ['workspace-shipments', orgId] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Create failed'),
  })

  const importMut = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new ApiError(400, 'Choose a CSV or JSON file to import')
      const form = new FormData()
      form.append('file', importFile)
      if (importOfficeId) form.append('office_id', importOfficeId)
      return api.postForm<{
        task_id?: string
        status?: string
        row_count?: number
        message?: string
      }>(SA.orgImportsUpload(orgId), form)
    },
    onSuccess: (result) => {
      setImportFile(null)
      setImportOfficeId('')
      setImportError('')
      setImportSuccess(
        result.message ||
          `Import queued${result.row_count != null ? ` (${result.row_count} rows)` : ''}.`,
      )
      void qc.invalidateQueries({ queryKey: ['workspace-shipments', orgId] })
    },
    onError: (e) => {
      setImportSuccess('')
      setImportError(e instanceof ApiError ? e.message : 'Import failed')
    },
  })

  const rows = query.data?.rows || []
  const offices = (officesQuery.data || []).filter((o) => o.isActive && o.id > 0)

  return (
    <div className="space-y-6">
      {query.isError ? (
        <ErrorBanner
          message={
            query.error instanceof ApiError ? query.error.message : 'Failed to load shipments'
          }
        />
      ) : null}

      <SectionCard title="Track shipment" description="Register an MBL for this organization.">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setError('')
            createMut.mutate()
          }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
        >
          <Field label="MBL">
            <Input value={mbl} onChange={(e) => setMbl(e.target.value)} required />
          </Field>
          <Field label="SCAC (optional)">
            <Input value={scac} onChange={(e) => setScac(e.target.value)} />
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create shipment'}
            </Button>
          </div>
        </form>
        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Import shipments"
        description="Upload a CSV or JSON file (max 500 rows). Import runs in the background."
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setImportError('')
            setImportSuccess('')
            importMut.mutate()
          }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
        >
          <Field label="File">
            <Input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] ?? null)
                setImportSuccess('')
                setImportError('')
              }}
              required
            />
          </Field>
          <Field label="Default office (optional)">
            <Select
              value={importOfficeId}
              onChange={(e) => setImportOfficeId(e.target.value)}
              disabled={officesQuery.isLoading}
            >
              <option value="">No default office</option>
              {offices.map((o) => (
                <option key={o.id} value={String(o.id)}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Button type="submit" disabled={importMut.isPending || !importFile}>
              {importMut.isPending ? 'Uploading…' : 'Import file'}
            </Button>
          </div>
        </form>
        {importFile ? (
          <p className="mt-2 text-xs text-[var(--muted)]">Selected: {importFile.name}</p>
        ) : null}
        {importError ? (
          <div className="mt-4">
            <ErrorBanner message={importError} />
          </div>
        ) : null}
        {importSuccess ? (
          <p className="mt-4 rounded-[var(--radius)] border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-3 py-2 text-sm text-[var(--ink)]">
            {importSuccess}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Shipments"
        description={
          query.data?.pagination.total
            ? `${query.data.pagination.total} total (showing up to ${SHIPMENT_PAGE_SIZE})`
            : undefined
        }
      >
        {query.isLoading ? (
          <LoadingBlock label="Loading shipments…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No shipments"
            body="Create a shipment by MBL above, or import a CSV/JSON file."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>MBL</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((raw) => (
                <tr key={rowId(raw) || pickStr(raw, 'mbl', 'mbl')} className="hover:bg-[var(--elevate)]">
                  <Td className="font-semibold">{pickStr(raw, 'mbl', 'mbl') || '—'}</Td>
                  <Td>{pickStr(raw, 'status', 'status') || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

function FieldsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  const query = useQuery({
    queryKey: ['workspace-fields', orgId],
    queryFn: async () => unwrapList<unknown>(await api.get(SA.orgFieldDefs(orgId))),
    enabled: !!orgId,
  })

  const createMut = useMutation({
    mutationFn: () =>
      api.post(SA.orgFieldDefs(orgId), {
        label: label.trim(),
        key: key.trim() || undefined,
        dataType: 'text',
        data_type: 'text',
      }),
    onSuccess: () => {
      setLabel('')
      setKey('')
      setError('')
      void qc.invalidateQueries({ queryKey: ['workspace-fields', orgId] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Create failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (fieldId: string) => api.delete(SA.orgFieldDef(orgId, fieldId)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace-fields', orgId] }),
  })

  const fields = query.data || []

  return (
    <div className="space-y-6">
      {query.isError ? (
        <ErrorBanner
          message={
            query.error instanceof ApiError ? query.error.message : 'Failed to load field definitions'
          }
        />
      ) : null}

      <SectionCard title="Create field">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setError('')
            createMut.mutate()
          }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
        >
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
          </Field>
          <Field label="Key (optional)">
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="auto from label" />
          </Field>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-1">
            <Badge tone="neutral">type: text</Badge>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Add field'}
            </Button>
          </div>
        </form>
        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Field definitions">
        {query.isLoading ? (
          <LoadingBlock label="Loading fields…" />
        ) : fields.length === 0 ? (
          <EmptyState title="No custom fields" body="Add a text field definition above." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Label</Th>
                <Th>Key</Th>
                <Th>Type</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {fields.map((raw) => {
                const id = rowId(raw)
                return (
                  <tr key={id} className="hover:bg-[var(--elevate)]">
                    <Td>{pickStr(raw, 'label', 'label')}</Td>
                    <Td className="font-mono text-xs">{pickStr(raw, 'key', 'key')}</Td>
                    <Td>{pickStr(raw, 'dataType', 'data_type') || 'text'}</Td>
                    <Td>
                      <Button
                        type="button"
                        variant="danger"
                        className="!py-1.5 !text-xs"
                        disabled={!id || deleteMut.isPending}
                        onClick={() => id && deleteMut.mutate(id)}
                      >
                        Delete
                      </Button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

function ConnectionsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState('TAI')
  const [error, setError] = useState('')

  const query = useQuery({
    queryKey: ['workspace-connections', orgId],
    queryFn: async () => unwrapList<unknown>(await api.get(SA.orgConnections(orgId))),
    enabled: !!orgId,
  })

  const createMut = useMutation({
    mutationFn: () =>
      api.post(SA.orgConnections(orgId), {
        name: name.trim(),
        sourceType: sourceType.trim(),
        source_type: sourceType.trim(),
      }),
    onSuccess: () => {
      setName('')
      setError('')
      void qc.invalidateQueries({ queryKey: ['workspace-connections', orgId] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Create failed'),
  })

  const connections = query.data || []

  return (
    <div className="space-y-6">
      {query.isError ? (
        <ErrorBanner
          message={
            query.error instanceof ApiError ? query.error.message : 'Failed to load connections'
          }
        />
      ) : null}

      <SectionCard title="Create connection">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setError('')
            createMut.mutate()
          }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_auto]"
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Source type">
            <Select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              <option value="TAI">TAI</option>
            </Select>
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Add connection'}
            </Button>
          </div>
        </form>
        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Source connections">
        {query.isLoading ? (
          <LoadingBlock label="Loading connections…" />
        ) : connections.length === 0 ? (
          <EmptyState
            title="No connections"
            body="Add a TAI (or other) source connection for inbound data."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Source type</Th>
                <Th>Active</Th>
              </tr>
            </thead>
            <tbody>
              {connections.map((raw) => (
                <tr key={rowId(raw)} className="hover:bg-[var(--elevate)]">
                  <Td className="font-semibold">{pickStr(raw, 'name', 'name')}</Td>
                  <Td>{pickStr(raw, 'sourceType', 'source_type')}</Td>
                  <Td>
                    {pickBool(raw, 'active', 'active') ? (
                      <Badge tone="ok">active</Badge>
                    ) : (
                      <Badge tone="neutral">inactive</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

function CustomersTab({ orgId, isInternalOrg }: { orgId: string; isInternalOrg: boolean }) {
  const qc = useQueryClient()
  const [customerOrgId, setCustomerOrgId] = useState('')
  const [error, setError] = useState('')

  const query = useQuery({
    queryKey: ['workspace-customers', orgId],
    queryFn: async () => unwrapList<unknown>(await api.get(SA.orgCustomers(orgId))),
    enabled: !!orgId && isInternalOrg,
  })

  const linkMut = useMutation({
    mutationFn: () =>
      api.post(SA.orgCustomers(orgId), {
        customerOrgId: customerOrgId.trim(),
        customer_org_id: customerOrgId.trim(),
      }),
    onSuccess: () => {
      setCustomerOrgId('')
      setError('')
      void qc.invalidateQueries({ queryKey: ['workspace-customers', orgId] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Link failed'),
  })

  const unlinkMut = useMutation({
    mutationFn: (cid: string) => api.delete(SA.orgCustomer(orgId, cid)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace-customers', orgId] }),
  })

  const links = query.data || []

  function customerLabel(raw: unknown): string {
    const customer = pick<unknown>(raw, 'customer', 'customer')
    const name = pickStr(customer, 'name', 'name')
    const id = pickStr(raw, 'customerOrgId', 'customer_org_id')
    return name ? `${name} (${id})` : id || '—'
  }

  if (!isInternalOrg) {
    return (
      <EmptyState
        title="Customers available on internal orgs"
        body="Customer organization links can only be managed from an internal organization. Switch to an internal org to link customers."
      />
    )
  }

  return (
    <div className="space-y-6">
      {query.isError ? (
        <ErrorBanner
          message={
            query.error instanceof ApiError ? query.error.message : 'Failed to load customers'
          }
        />
      ) : null}

      <SectionCard title="Link customer organization">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setError('')
            linkMut.mutate()
          }}
          className="grid gap-4 sm:grid-cols-[1fr_auto]"
        >
          <Field label="Customer organization ID">
            <Input
              value={customerOrgId}
              onChange={(e) => setCustomerOrgId(e.target.value)}
              required
              placeholder="UUID of customer org"
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={linkMut.isPending}>
              {linkMut.isPending ? 'Linking…' : 'Link customer'}
            </Button>
          </div>
        </form>
        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Linked customers">
        {query.isLoading ? (
          <LoadingBlock label="Loading customers…" />
        ) : links.length === 0 ? (
          <EmptyState title="No linked customers" body="Link a non-internal customer organization." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {links.map((raw) => {
                const cid = pickStr(raw, 'customerOrgId', 'customer_org_id')
                return (
                  <tr key={rowId(raw) || cid} className="hover:bg-[var(--elevate)]">
                    <Td>{customerLabel(raw)}</Td>
                    <Td>
                      <Button
                        type="button"
                        variant="danger"
                        className="!py-1.5 !text-xs"
                        disabled={!cid || unlinkMut.isPending}
                        onClick={() => cid && unlinkMut.mutate(cid)}
                      >
                        Unlink
                      </Button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

function RoutingTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['workspace-routing', orgId],
    queryFn: async () => unwrapList<unknown>(await api.get(SA.orgAssignmentRules(orgId))),
    enabled: !!orgId,
  })

  const deleteMut = useMutation({
    mutationFn: (ruleId: string) => api.delete(SA.orgAssignmentRule(orgId, ruleId)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workspace-routing', orgId] }),
  })

  const rules = query.data || []

  return (
    <div className="space-y-6">
      {query.isError ? (
        <ErrorBanner
          message={
            query.error instanceof ApiError ? query.error.message : 'Failed to load routing rules'
          }
        />
      ) : null}

      <SectionCard title="Assignment rules">
        {query.isLoading ? (
          <LoadingBlock label="Loading rules…" />
        ) : rules.length === 0 ? (
          <EmptyState title="No routing rules" body="Org-scoped rules appear here when configured." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Priority</Th>
                <Th>Enabled</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((raw) => {
                const id = rowId(raw)
                const priority = pick(raw, 'priority', 'priority')
                return (
                  <tr key={id} className="hover:bg-[var(--elevate)]">
                    <Td className="font-semibold">{pickStr(raw, 'name', 'name') || '—'}</Td>
                    <Td>{priority !== undefined ? String(priority) : '—'}</Td>
                    <Td>
                      {pickBool(raw, 'enabled', 'enabled', true) ? (
                        <Badge tone="ok">yes</Badge>
                      ) : (
                        <Badge tone="neutral">no</Badge>
                      )}
                    </Td>
                    <Td>
                      <Button
                        type="button"
                        variant="danger"
                        className="!py-1.5 !text-xs"
                        disabled={!id || deleteMut.isPending}
                        onClick={() => id && deleteMut.mutate(id)}
                      >
                        Delete
                      </Button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

export function WorkspacePage() {
  const qc = useQueryClient()
  const searchString = useSearch()
  const orgFromUrl = useMemo(() => {
    const params = new URLSearchParams(searchString.startsWith('?') ? searchString.slice(1) : searchString)
    return (params.get('org') || params.get('orgId') || '').trim()
  }, [searchString])

  const [orgSearch, setOrgSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState(orgFromUrl)
  const [subTab, setSubTab] = useState<WorkspaceTab>('members')
  const [complianceError, setComplianceError] = useState('')

  useEffect(() => {
    if (orgFromUrl) setSelectedOrgId(orgFromUrl)
  }, [orgFromUrl])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(orgSearch.trim()), 300)
    return () => window.clearTimeout(t)
  }, [orgSearch])

  const orgsQuery = useQuery({
    queryKey: ['workspace-orgs', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        page_size: String(ORG_PAGE_SIZE),
        search: debouncedSearch,
        approved: 'true',
      })
      const payload = await api.get(`${SA.orgs}?${params}`)
      return {
        orgs: unwrapList<unknown>(payload).map(normalizeOrg),
        pagination: unwrapPagination(payload),
      }
    },
  })

  // Deep-link / org-name click: load that org even if not in the approved picker page.
  const linkedOrgQuery = useQuery({
    queryKey: ['workspace-org', selectedOrgId],
    queryFn: async () => normalizeOrg(await api.get(SA.org(selectedOrgId))),
    enabled: !!selectedOrgId,
  })

  const selectedOrg = useMemo(() => {
    if (!selectedOrgId) return null
    if (linkedOrgQuery.data?.id === selectedOrgId) return linkedOrgQuery.data
    return orgsQuery.data?.orgs.find((o) => o.id === selectedOrgId) ?? null
  }, [linkedOrgQuery.data, orgsQuery.data?.orgs, selectedOrgId])

  const pickerOrgs = useMemo(() => {
    const list = [...(orgsQuery.data?.orgs || [])]
    if (selectedOrg && !list.some((o) => o.id === selectedOrg.id)) {
      list.unshift(selectedOrg)
    }
    return list
  }, [orgsQuery.data?.orgs, selectedOrg])

  useEffect(() => {
    setSubTab('members')
  }, [selectedOrgId])

  function selectOrg(id: string) {
    setSelectedOrgId(id)
    const next = id ? `/workspace?org=${encodeURIComponent(id)}` : '/workspace'
    window.history.replaceState(null, '', next)
  }

  const complianceMut = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch(SA.org(selectedOrgId), { complianceEnabled: enabled }),
    onSuccess: () => {
      setComplianceError('')
      void qc.invalidateQueries({ queryKey: ['workspace-orgs'] })
      void qc.invalidateQueries({ queryKey: ['workspace-org', selectedOrgId] })
    },
    onError: (e) =>
      setComplianceError(e instanceof ApiError ? e.message : 'Could not update compliance'),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization workspace"
        description="Superuser workspace for members, shipments, fields, connections, and routing for any organization."
      />

      {orgsQuery.isError ? (
        <ErrorBanner
          message={
            orgsQuery.error instanceof ApiError ? orgsQuery.error.message : 'Failed to load organizations'
          }
        />
      ) : null}

      {selectedOrgId && linkedOrgQuery.isError ? (
        <ErrorBanner
          message={
            linkedOrgQuery.error instanceof ApiError
              ? linkedOrgQuery.error.message
              : 'Could not load the selected organization'
          }
        />
      ) : null}

      <SectionCard
        title="Select organization"
        description="Pick an approved org, or open one from Organizations by clicking its name."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Search">
            <Input
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              placeholder="Search by name…"
            />
          </Field>
          <Field label="Organization">
            <Select
              value={selectedOrgId}
              onChange={(e) => selectOrg(e.target.value)}
              disabled={orgsQuery.isLoading && !selectedOrg}
            >
              <option value="">
                {orgsQuery.isLoading ? 'Loading…' : 'Select organization'}
              </option>
              {pickerOrgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                  {!orgIsApproved(org) ? ' (pending)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {orgsQuery.data?.pagination.total ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            {orgsQuery.data.pagination.total} matching (up to {ORG_PAGE_SIZE} shown)
          </p>
        ) : null}
      </SectionCard>

      {!selectedOrgId ? (
        <EmptyState
          title="No organization selected"
          body="Choose an organization above, or open one from the Organizations list."
        />
      ) : linkedOrgQuery.isLoading && !selectedOrg ? (
        <LoadingBlock label="Loading organization…" />
      ) : !selectedOrg ? (
        <EmptyState
          title="Organization not found"
          body="The linked organization could not be loaded. Pick another from the list."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Managing</span>
            <span className="font-semibold text-[var(--ink)]">{selectedOrg.name}</span>
            <Badge tone="brand">{orgKindLabel(selectedOrg)}</Badge>
            {!orgIsApproved(selectedOrg) ? <Badge tone="warn">pending</Badge> : null}
            {selectedOrg.address ? (
              <span className="text-xs text-[var(--muted)]">· {selectedOrg.address}</span>
            ) : null}
          </div>

          <SectionCard title="Organization details">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Name
                </dt>
                <dd className="mt-0.5 font-semibold">{selectedOrg.name}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Type
                </dt>
                <dd className="mt-0.5">{orgKindLabel(selectedOrg)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Status
                </dt>
                <dd className="mt-0.5">
                  {orgIsApproved(selectedOrg) ? 'Approved' : 'Pending approval'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Address
                </dt>
                <dd className="mt-0.5">{selectedOrg.address || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Created
                </dt>
                <dd className="mt-0.5">{selectedOrg.createdAt || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Approved
                </dt>
                <dd className="mt-0.5">{selectedOrg.approvedAt || '—'}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Compliance features">
            <p className="mb-3 text-sm text-[var(--muted)]">
              When enabled, org owners can grant Compliance user (CSV export) and manual LFD/LRD entry
              to members.
            </p>
            <Checkbox
              id="workspace-compliance"
              label="Compliance enabled"
              checked={selectedOrg.complianceEnabled}
              onChange={(next) => {
                setComplianceError('')
                complianceMut.mutate(next)
              }}
            />
            {complianceMut.isPending ? (
              <p className="mt-2 text-xs text-[var(--muted)]">Saving…</p>
            ) : null}
            {complianceError ? (
              <div className="mt-3">
                <ErrorBanner message={complianceError} />
              </div>
            ) : null}
          </SectionCard>

          <SubTabBar active={subTab} onChange={setSubTab} />

          {subTab === 'members' ? <MembersTab orgId={selectedOrgId} /> : null}
          {subTab === 'offices' ? <OfficesTab orgId={selectedOrgId} /> : null}
          {subTab === 'shipments' ? <ShipmentsTab orgId={selectedOrgId} /> : null}
          {subTab === 'fields' ? <FieldsTab orgId={selectedOrgId} /> : null}
          {subTab === 'connections' ? <ConnectionsTab orgId={selectedOrgId} /> : null}
          {subTab === 'customers' ? (
            <CustomersTab orgId={selectedOrgId} isInternalOrg={selectedOrg.isInternalOrg} />
          ) : null}
          {subTab === 'routing' ? <RoutingTab orgId={selectedOrgId} /> : null}
        </>
      )}
    </div>
  )
}
