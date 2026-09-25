import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, SA, unwrapList } from '../lib/api'
import {
  asRecord,
  normalizeOrg,
  pick,
  pickBool,
  pickStr,
  unwrapPagination,
  type NormalizedOrg,
  type PaginationMeta,
} from '../lib/normalize'
import {
  Badge,
  Button,
  Checkbox,
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
} from '../components/ui'

type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
type ScopeFilter = 'all' | 'internal' | 'customer' | 'superusers'

type Membership = { orgId: string; role: OrgRole }

type OfficeAssignment = {
  officeId: number
  officeName: string
  orgId: string
  orgName?: string
}

type UserRow = {
  id: string
  email: string
  name?: string
  username?: string
  isSuperuser: boolean
  isActive: boolean
  usersMonitor: boolean
  memberships: Membership[]
  offices: OfficeAssignment[]
}

type UserForm = {
  email: string
  name: string
  username: string
  password: string
  isActive: boolean
  isSuperuser: boolean
  usersMonitor: boolean
  memberships: Membership[]
}

const PAGE_SIZE = 50
const emptyForm = (): UserForm => ({
  email: '',
  name: '',
  username: '',
  password: '',
  isActive: true,
  isSuperuser: false,
  usersMonitor: false,
  memberships: [],
})

function mapMembership(raw: unknown): Membership {
  return {
    orgId: pickStr(raw, 'orgId', 'org_id'),
    role: (pickStr(raw, 'role', 'role') || 'MEMBER').toUpperCase() as OrgRole,
  }
}

function mapOffice(raw: unknown): OfficeAssignment {
  return {
    officeId: Number(pick(raw, 'officeId', 'office_id') ?? 0),
    officeName: pickStr(raw, 'officeName', 'office_name') || `Office`,
    orgId: pickStr(raw, 'orgId', 'org_id'),
    orgName: pickStr(raw, 'orgName', 'org_name') || undefined,
  }
}

function mapUser(raw: unknown): UserRow {
  const r = asRecord(raw)
  const memberships = Array.isArray(r.memberships) ? r.memberships.map(mapMembership) : []
  const offices = Array.isArray(r.offices) ? r.offices.map(mapOffice) : []
  return {
    id: String(r.id ?? ''),
    email: pickStr(raw, 'email', 'email'),
    name: pickStr(raw, 'name', 'full_name') || undefined,
    username: pickStr(raw, 'username', 'username') || undefined,
    isSuperuser: pickBool(raw, 'isSuperuser', 'is_superuser'),
    isActive: pickBool(raw, 'isActive', 'is_active', true),
    usersMonitor: pickBool(raw, 'usersMonitor', 'users_monitor'),
    memberships,
    offices,
  }
}

async function reconcileMemberships(
  user: { id: string; email: string; name?: string },
  next: Membership[],
  previous: Membership[],
) {
  const prevByOrg = new Map(previous.map((m) => [m.orgId, m.role]))
  const nextByOrg = new Map(next.map((m) => [m.orgId, m.role]))

  for (const membership of next) {
    if (!membership.orgId) continue
    const prevRole = prevByOrg.get(membership.orgId)
    if (!prevRole) {
      await api.post(SA.orgMembers(membership.orgId), {
        email: user.email,
        name: user.name || undefined,
        role: membership.role,
      })
      continue
    }
    if (prevRole !== membership.role) {
      await api.patch(SA.orgMember(membership.orgId, user.id), { role: membership.role })
    }
  }

  for (const membership of previous) {
    if (!nextByOrg.has(membership.orgId)) {
      await api.delete(SA.orgMember(membership.orgId, user.id))
    }
  }
}

export function UsersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [offices, setOffices] = useState<OfficeAssignment[]>([])
  const [officeOrgId, setOfficeOrgId] = useState('')
  const [officeIdToAdd, setOfficeIdToAdd] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [scope])

  const listQuery = useQuery({
    queryKey: ['users', page, debouncedSearch, scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (scope === 'superusers') params.set('internalOnly', 'true')
      if (scope === 'internal') params.set('orgIsInternal', 'true')
      if (scope === 'customer') params.set('orgIsInternal', 'false')
      const payload = await api.get(`${SA.users}?${params}`)
      return {
        users: unwrapList(payload).map(mapUser),
        pagination: unwrapPagination(payload),
      }
    },
  })

  const orgsQuery = useQuery({
    queryKey: ['users-org-picker', scope],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', page_size: '100' })
      if (scope === 'internal') params.set('isInternal', 'true')
      if (scope === 'customer') params.set('isInternal', 'false')
      const payload = await api.get(`${SA.orgs}?${params}`)
      return unwrapList(payload).map(normalizeOrg)
    },
    enabled: dialogOpen,
  })

  const orgNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const org of orgsQuery.data || []) map[org.id] = org.name
    return map
  }, [orgsQuery.data])

  const officesQuery = useQuery({
    queryKey: ['users-office-picker', officeOrgId],
    queryFn: async () => {
      const payload = await api.get(SA.orgOffices(officeOrgId))
      return unwrapList(payload).map((raw) => {
        const r = asRecord(raw)
        return {
          id: Number(r.id ?? 0),
          name: pickStr(raw, 'name', 'name') || `Office #${r.id}`,
          isActive: pickBool(raw, 'isActive', 'is_active', true),
        }
      })
    },
    enabled: dialogOpen && !!editing && !!officeOrgId,
  })

  const availableOffices = useMemo(() => {
    const assigned = new Set(
      offices.filter((o) => o.orgId === officeOrgId).map((o) => o.officeId),
    )
    return (officesQuery.data || []).filter((o) => o.isActive && !assigned.has(o.id))
  }, [officesQuery.data, officeOrgId, offices])

  function invalidateUsers() {
    void qc.invalidateQueries({ queryKey: ['users'] })
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOffices([])
    setOfficeOrgId('')
    setOfficeIdToAdd('')
    setFormError('')
    setDialogOpen(true)
  }

  function openEdit(user: UserRow) {
    setEditing(user)
    setForm({
      email: user.email,
      name: user.name || '',
      username: user.username || '',
      password: '',
      isActive: user.isActive,
      isSuperuser: user.isSuperuser,
      usersMonitor: user.usersMonitor,
      memberships: user.memberships.map((m) => ({ ...m })),
    })
    setOffices(user.offices.map((o) => ({ ...o })))
    setOfficeOrgId(user.memberships[0]?.orgId || '')
    setOfficeIdToAdd('')
    setFormError('')
    setDialogOpen(true)
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editing && form.password.trim().length < 8) {
        throw new ApiError(400, 'Password is required (min 8 characters) when creating a user.')
      }
      const accountPayload: Record<string, unknown> = {
        email: form.email.trim(),
        name: form.name.trim() || null,
        username: form.username.trim() || null,
        is_active: form.isActive,
        is_superuser: form.isSuperuser,
        users_monitor: form.usersMonitor,
      }
      if (form.password.trim()) accountPayload.password = form.password.trim()

      let saved: UserRow
      if (editing) {
        const res = await api.patch(SA.user(editing.id), accountPayload)
        saved = mapUser(res)
        await reconcileMemberships(
          { id: saved.id, email: saved.email, name: saved.name },
          form.memberships.filter((m) => m.orgId),
          editing.memberships,
        )
      } else {
        const res = await api.post(SA.users, {
          ...accountPayload,
          password: form.password.trim(),
        })
        saved = mapUser(res)
        await reconcileMemberships(
          { id: saved.id, email: saved.email, name: saved.name },
          form.memberships.filter((m) => m.orgId),
          [],
        )
      }
      return saved
    },
    onSuccess: () => {
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyForm())
      setFormError('')
      invalidateUsers()
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Save failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(SA.user(id)),
    onSuccess: () => {
      setDeleteId(null)
      invalidateUsers()
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Delete failed'),
  })

  const addOfficeMut = useMutation({
    mutationFn: async () => {
      if (!editing || !officeOrgId || !officeIdToAdd) {
        throw new ApiError(400, 'Select an organization and office')
      }
      const officeId = Number(officeIdToAdd)
      await api.post(SA.orgOfficeMembers(officeOrgId, officeId), { user_id: editing.id })
      const office = availableOffices.find((o) => o.id === officeId)
      return {
        officeId,
        officeName: office?.name || `Office #${officeId}`,
        orgId: officeOrgId,
        orgName: orgNameById[officeOrgId],
      } satisfies OfficeAssignment
    },
    onSuccess: (row) => {
      setOffices((prev) => [...prev, row])
      setOfficeIdToAdd('')
      invalidateUsers()
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Could not assign office'),
  })

  const removeOfficeMut = useMutation({
    mutationFn: async (row: OfficeAssignment) => {
      if (!editing) throw new ApiError(400, 'No user selected')
      await api.delete(SA.orgOfficeMember(row.orgId, row.officeId, editing.id))
      return row
    },
    onSuccess: (row) => {
      setOffices((prev) =>
        prev.filter((o) => !(o.orgId === row.orgId && o.officeId === row.officeId)),
      )
      invalidateUsers()
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Could not remove office'),
  })

  function onSave(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    saveMut.mutate()
  }

  const users = listQuery.data?.users || []
  const pagination: PaginationMeta = listQuery.data?.pagination || {
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  }
  const totalPages = Math.max(1, pagination.totalPages)
  const orgs: NormalizedOrg[] = orgsQuery.data || []
  const membershipOrgIds = new Set(form.memberships.map((m) => m.orgId).filter(Boolean))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Platform directory — create, update, and assign org memberships."
        actions={
          <Button type="button" onClick={openCreate}>
            Create user
          </Button>
        }
      />

      {listQuery.isError ? (
        <ErrorBanner
          message={
            listQuery.error instanceof ApiError ? listQuery.error.message : 'Failed to load users'
          }
        />
      ) : null}

      <SectionCard title="Filters">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Search">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, username"
            />
          </Field>
          <Field label="Scope">
            <Select value={scope} onChange={(e) => setScope(e.target.value as ScopeFilter)}>
              <option value="all">All users</option>
              <option value="internal">Internal org members</option>
              <option value="customer">Customer org members</option>
              <option value="superusers">Superusers only</option>
            </Select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Directory"
        description={
          pagination.total
            ? `Page ${pagination.page} of ${totalPages} · ${pagination.total} total`
            : undefined
        }
      >
        {listQuery.isLoading ? (
          <LoadingBlock label="Loading users…" />
        ) : users.length === 0 ? (
          <EmptyState title="No users found" body="Try another search or create a platform user." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Name</Th>
                  <Th>Username</Th>
                  <Th>Flags</Th>
                  <Th>Memberships</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--elevate)]">
                    <Td className="font-semibold">{u.email}</Td>
                    <Td>{u.name || '—'}</Td>
                    <Td className="text-[var(--muted)]">{u.username || '—'}</Td>
                    <Td className="space-x-1">
                      {u.isSuperuser ? <Badge tone="ok">superuser</Badge> : null}
                      {!u.isActive ? <Badge tone="danger">inactive</Badge> : null}
                      {u.usersMonitor ? <Badge tone="brand">monitor</Badge> : null}
                      {u.isActive && !u.isSuperuser && !u.usersMonitor ? (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      ) : null}
                    </Td>
                    <Td className="text-xs text-[var(--muted)]">
                      {u.memberships.length
                        ? `${u.memberships.length} org${u.memberships.length === 1 ? '' : 's'}`
                        : '—'}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="!py-1.5 !text-xs"
                          onClick={() => openEdit(u)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          className="!py-1.5 !text-xs"
                          onClick={() => setDeleteId(u.id)}
                        >
                          Delete
                        </Button>
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

      <Dialog
        open={dialogOpen}
        title={editing ? 'Edit user' : 'Create user'}
        onClose={() => {
          setDialogOpen(false)
          setEditing(null)
          setFormError('')
        }}
        wide
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDialogOpen(false)
                setEditing(null)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form="user-form" disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={onSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </Field>
            <Field label="Username">
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </Field>
            <Field label="Full name">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label={editing ? 'Password (optional)' : 'Password'}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                minLength={editing ? undefined : 8}
                required={!editing}
                placeholder={editing ? 'Leave blank to keep' : 'Min 8 characters'}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4">
            <Checkbox
              label="Active"
              checked={form.isActive}
              onChange={(next) => setForm((f) => ({ ...f, isActive: next }))}
            />
            <Checkbox
              label="Superuser"
              checked={form.isSuperuser}
              onChange={(next) => setForm((f) => ({ ...f, isSuperuser: next }))}
            />
            <Checkbox
              label="Users monitor"
              checked={form.usersMonitor}
              onChange={(next) => setForm((f) => ({ ...f, usersMonitor: next }))}
            />
          </div>

          <div className="space-y-3 border-t border-[var(--line)] pt-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Organization memberships</h4>
              <Button
                type="button"
                variant="secondary"
                className="!py-1.5 !text-xs"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    memberships: [...f.memberships, { orgId: '', role: 'MEMBER' }],
                  }))
                }
              >
                Add membership
              </Button>
            </div>
            {form.memberships.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No org memberships yet.</p>
            ) : (
              form.memberships.map((m, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                  <Select
                    value={m.orgId}
                    onChange={(e) => {
                      const orgId = e.target.value
                      setForm((f) => {
                        const next = [...f.memberships]
                        next[idx] = { ...next[idx], orgId }
                        return { ...f, memberships: next }
                      })
                    }}
                  >
                    <option value="">Select organization</option>
                    {orgs.map((org) => (
                      <option
                        key={org.id}
                        value={org.id}
                        disabled={membershipOrgIds.has(org.id) && m.orgId !== org.id}
                      >
                        {org.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={m.role}
                    onChange={(e) => {
                      const role = e.target.value as OrgRole
                      setForm((f) => {
                        const next = [...f.memberships]
                        next[idx] = { ...next[idx], role }
                        return { ...f, memberships: next }
                      })
                    }}
                  >
                    <option value="OWNER">OWNER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="MEMBER">MEMBER</option>
                    <option value="VIEWER">VIEWER</option>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    className="!text-xs"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        memberships: f.memberships.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>

          {editing ? (
            <div className="space-y-3 border-t border-[var(--line)] pt-4">
              <h4 className="text-sm font-semibold">Office assignments</h4>
              <p className="text-xs text-[var(--muted)]">
                Assign this user to offices within their organization memberships. Save memberships
                first if you just added an org.
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Select
                  value={officeOrgId}
                  onChange={(e) => {
                    setOfficeOrgId(e.target.value)
                    setOfficeIdToAdd('')
                  }}
                >
                  <option value="">Organization</option>
                  {form.memberships
                    .filter((m) => m.orgId)
                    .map((m) => (
                      <option key={m.orgId} value={m.orgId}>
                        {orgNameById[m.orgId] || m.orgId}
                      </option>
                    ))}
                </Select>
                <Select
                  value={officeIdToAdd}
                  onChange={(e) => setOfficeIdToAdd(e.target.value)}
                  disabled={!officeOrgId}
                >
                  <option value="">Office</option>
                  {availableOffices.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!officeOrgId || !officeIdToAdd || addOfficeMut.isPending}
                  onClick={() => addOfficeMut.mutate()}
                >
                  Assign
                </Button>
              </div>
              {offices.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No office assignments.</p>
              ) : (
                <ul className="space-y-2">
                  {offices.map((o) => (
                    <li
                      key={`${o.orgId}-${o.officeId}`}
                      className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--line)] px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-semibold">{o.officeName}</span>
                        <span className="text-[var(--muted)]">
                          {' '}
                          · {o.orgName || orgNameById[o.orgId] || o.orgId}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!text-xs"
                        disabled={removeOfficeMut.isPending}
                        onClick={() => removeOfficeMut.mutate(o)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {formError ? <ErrorBanner message={formError} /> : null}
        </form>
      </Dialog>

      <Dialog
        open={!!deleteId}
        title="Delete user"
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={deleteMut.isPending}
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--muted)]">
          This permanently removes the user account. Memberships will be cleared. This cannot be
          undone.
        </p>
      </Dialog>
    </div>
  )
}
