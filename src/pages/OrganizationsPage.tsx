import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'wouter'
import { api, ApiError, SA, unwrapList } from '../lib/api'
import {
  normalizeOrg,
  orgKindLabel,
  unwrapPagination,
  type NormalizedOrg,
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

type TypeFilter = 'all' | 'internal' | 'customer'
type ApprovedFilter = 'all' | 'approved' | 'pending'

type OrganizationFormData = {
  name: string
  address: string
  contactName: string
  contactPhone: string
  initialName: string
  initialEmail: string
  isInternalOrg: boolean
  linkInternalOrgId: string
  isConsignee: boolean
  isHblShipper: boolean
  isOverseaAgent: boolean
}

const emptyForm: OrganizationFormData = {
  name: '',
  address: '',
  contactName: '',
  contactPhone: '',
  initialName: '',
  initialEmail: '',
  isInternalOrg: false,
  linkInternalOrgId: '',
  isConsignee: false,
  isHblShipper: false,
  isOverseaAgent: false,
}

const PAGE_SIZE = 25

function contactFromOrg(org: NormalizedOrg) {
  const raw = org.raw
  const info = (raw.contactInfo ?? raw.contact_info) as Record<string, unknown> | undefined
  const contactEmail =
    (info?.email as string | undefined) ||
    (info?.contact_email as string | undefined) ||
    (raw.contact_email as string | undefined) ||
    ''
  return {
    contactName:
      (info?.name as string | undefined) ||
      (raw.contact_name as string | undefined) ||
      '',
    contactPhone:
      (info?.phone as string | undefined) ||
      (info?.contact_phone as string | undefined) ||
      (raw.contact_phone as string | undefined) ||
      '',
    contactEmail,
  }
}

function resolveInviteEmail(data: OrganizationFormData, org: NormalizedOrg | null): string {
  const raw =
    data.initialEmail.trim() ||
    (org ? contactFromOrg(org).contactEmail : '') ||
    ''
  const first = raw
    .split(/[,;]+/)
    .map((part) => part.trim())
    .find((part) => part.includes('@'))
  return (first || raw).trim().toLowerCase()
}

function buildOrgPayload(data: OrganizationFormData, mode: 'create' | 'patch') {
  const payload: Record<string, unknown> = {
    name: data.name.trim(),
    address: data.address.trim() || undefined,
    isInternalOrg: data.isInternalOrg,
    contactInfo: {
      name: data.contactName.trim() || undefined,
      email: data.initialEmail.trim() || undefined,
      phone: data.contactPhone.trim() || undefined,
    },
  }
  if (mode === 'create') {
    payload.initialEmail = data.initialEmail.trim()
    payload.initialName =
      data.initialName.trim() ||
      data.contactName.trim() ||
      data.name.trim() ||
      undefined
    if (!data.isInternalOrg && data.linkInternalOrgId) {
      payload.linkInternalOrgId = data.linkInternalOrgId
    }
  }
  if (!data.isInternalOrg) {
    payload.isConsignee = data.isConsignee
    payload.isHblShipper = data.isHblShipper
    payload.isOverseaAgent = data.isOverseaAgent
  }
  return payload
}

function orgListQueryKey(
  debouncedSearch: string,
  page: number,
  typeFilter: TypeFilter,
  approvedFilter: ApprovedFilter,
) {
  return ['organizations', debouncedSearch, page, typeFilter, approvedFilter] as const
}

export function OrganizationsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [approvedFilter, setApprovedFilter] = useState<ApprovedFilter>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<NormalizedOrg | null>(null)
  const [formData, setFormData] = useState<OrganizationFormData>(emptyForm)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const listQuery = useQuery({
    queryKey: orgListQueryKey(debouncedSearch, page, typeFilter, approvedFilter),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (typeFilter === 'internal') params.set('isInternal', 'true')
      if (typeFilter === 'customer') params.set('isInternal', 'false')
      if (approvedFilter === 'approved') params.set('approved', 'true')
      if (approvedFilter === 'pending') params.set('approved', 'false')
      const payload = await api.get(`${SA.orgs}?${params}`)
      return {
        orgs: unwrapList<unknown>(payload).map(normalizeOrg),
        pagination: unwrapPagination(payload),
      }
    },
  })

  const pendingCountQuery = useQuery({
    queryKey: ['organizations-pending-count'],
    queryFn: async () => {
      const payload = await api.get(`${SA.orgs}?page=1&page_size=1&approved=false`)
      return unwrapPagination(payload).total
    },
  })

  const internalOrgsQuery = useQuery({
    queryKey: ['organizations-internal-approved'],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        page_size: '100',
        isInternal: 'true',
        approved: 'true',
      })
      const payload = await api.get(`${SA.orgs}?${params}`)
      return unwrapList<unknown>(payload).map(normalizeOrg)
    },
    enabled: createOpen && !formData.isInternalOrg,
  })

  function invalidateOrgs() {
    void qc.invalidateQueries({ queryKey: ['organizations'] })
    void qc.invalidateQueries({ queryKey: ['organizations-pending-count'] })
    void qc.invalidateQueries({ queryKey: ['org-approvals'] })
  }

  const createMut = useMutation({
    mutationFn: () => api.post(SA.orgs, buildOrgPayload(formData, 'create')),
    onSuccess: () => {
      setCreateOpen(false)
      setFormData(emptyForm)
      setFormError('')
      invalidateOrgs()
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Create failed'),
  })

  const updateMut = useMutation({
    mutationFn: (id: string) => api.patch(SA.org(id), buildOrgPayload(formData, 'patch')),
    onSuccess: () => {
      setEditOpen(false)
      setSelectedOrg(null)
      setFormData(emptyForm)
      setFormError('')
      invalidateOrgs()
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Update failed'),
  })

  const saveInviteMut = useMutation({
    mutationFn: async ({ id, org }: { id: string; org: NormalizedOrg }) => {
      const inviteEmail = resolveInviteEmail(formData, org)
      if (!inviteEmail.includes('@')) {
        throw new ApiError(400, 'Owner email is required to invite.')
      }
      await api.patch(SA.org(id), buildOrgPayload(formData, 'patch'))
      const inviteName =
        formData.initialName.trim() ||
        formData.contactName.trim() ||
        formData.name.trim() ||
        undefined
      await api.post(SA.orgInvites(id), {
        email: inviteEmail,
        role: 'OWNER',
        name: inviteName,
      })
    },
    onSuccess: () => {
      setEditOpen(false)
      setSelectedOrg(null)
      setFormData(emptyForm)
      setFormError('')
      invalidateOrgs()
    },
    onError: (e) =>
      setFormError(e instanceof ApiError ? e.message : 'Save & invite failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(SA.org(id)),
    onSuccess: () => {
      setDeleteOpen(false)
      setSelectedOrg(null)
      invalidateOrgs()
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Delete failed'),
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => api.post(SA.orgApprove(id)),
    onSuccess: invalidateOrgs,
  })

  const rejectMut = useMutation({
    mutationFn: (id: string) => api.post(SA.orgReject(id)),
    onSuccess: invalidateOrgs,
  })

  const orgs = listQuery.data?.orgs ?? []
  const pagination = listQuery.data?.pagination
  const pendingTotal = pendingCountQuery.data ?? 0

  function openCreate() {
    setFormData(emptyForm)
    setFormError('')
    setCreateOpen(true)
  }

  function openEdit(org: NormalizedOrg) {
    const contact = contactFromOrg(org)
    const inviteEmail =
      contact.contactEmail
        .split(/[,;]+/)
        .map((part) => part.trim())
        .find((part) => part.includes('@')) || contact.contactEmail
    setSelectedOrg(org)
    setFormData({
      name: org.name,
      address: org.address || '',
      contactName: contact.contactName,
      contactPhone: contact.contactPhone,
      initialName: contact.contactName,
      initialEmail: inviteEmail,
      isInternalOrg: org.isInternalOrg,
      linkInternalOrgId: '',
      isConsignee: org.isConsignee,
      isHblShipper: org.isHblShipper,
      isOverseaAgent: org.isOverseaAgent,
    })
    setFormError('')
    setEditOpen(true)
  }

  function openDelete(org: NormalizedOrg) {
    setSelectedOrg(org)
    setFormError('')
    setDeleteOpen(true)
  }

  function onCreateSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    createMut.mutate()
  }

  function onEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedOrg) return
    setFormError('')
    updateMut.mutate(selectedOrg.id)
  }

  function renderOrgFields(opts: { inviteRequired: boolean; showLinkInternal: boolean }) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name *">
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="ACME Logistics"
            required
          />
        </Field>
        <Field label="Address">
          <Input
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="Optional"
          />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox
            checked={formData.isInternalOrg}
            onChange={(checked) =>
              setFormData({
                ...formData,
                isInternalOrg: checked,
                linkInternalOrgId: checked ? '' : formData.linkInternalOrgId,
                isConsignee: checked ? false : formData.isConsignee,
                isHblShipper: checked ? false : formData.isHblShipper,
                isOverseaAgent: checked ? false : formData.isOverseaAgent,
              })
            }
            label="Internal organization"
          />
        </div>
        {!formData.isInternalOrg ? (
          <div className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] p-4 sm:col-span-2">
            <p className="text-sm font-semibold text-[var(--ink)]">Customer types</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Checkbox
                checked={formData.isConsignee}
                onChange={(v) => setFormData({ ...formData, isConsignee: v })}
                label="Consignee"
              />
              <Checkbox
                checked={formData.isHblShipper}
                onChange={(v) => setFormData({ ...formData, isHblShipper: v })}
                label="HBL shipper"
              />
              <Checkbox
                checked={formData.isOverseaAgent}
                onChange={(v) => setFormData({ ...formData, isOverseaAgent: v })}
                label="Oversea agent"
              />
            </div>
          </div>
        ) : null}
        {opts.showLinkInternal && !formData.isInternalOrg ? (
          <Field label="Link to internal org (optional)">
            <Select
              value={formData.linkInternalOrgId}
              onChange={(e) =>
                setFormData({ ...formData, linkInternalOrgId: e.target.value })
              }
              disabled={internalOrgsQuery.isLoading}
            >
              <option value="">— None —</option>
              {(internalOrgsQuery.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Contact name">
          <Input
            value={formData.contactName}
            onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
          />
        </Field>
        <Field label="Contact phone">
          <Input
            value={formData.contactPhone}
            onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
          />
        </Field>
        <Field label={opts.inviteRequired ? 'Owner email *' : 'Contact / owner email'}>
          <Input
            type="email"
            value={formData.initialEmail}
            onChange={(e) => setFormData({ ...formData, initialEmail: e.target.value })}
            required={opts.inviteRequired}
          />
        </Field>
        <Field label="Owner display name">
          <Input
            value={formData.initialName}
            onChange={(e) => setFormData({ ...formData, initialName: e.target.value })}
            placeholder="Optional"
          />
        </Field>
      </div>
    )
  }

  function renderRowActions(org: NormalizedOrg) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="!py-1.5 !text-xs" onClick={() => openEdit(org)}>
          Edit
        </Button>
        <Link href={`/workspace?org=${encodeURIComponent(org.id)}`}>
          <Button type="button" variant="brand" className="!py-1.5 !text-xs">
            Workspace
          </Button>
        </Link>
        {!org.isApproved ? (
          <Button
            type="button"
            className="!py-1.5 !text-xs"
            disabled={approveMut.isPending}
            onClick={() => approveMut.mutate(org.id)}
          >
            Approve
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="!py-1.5 !text-xs"
          disabled={rejectMut.isPending}
          onClick={() => rejectMut.mutate(org.id)}
        >
          {org.isApproved ? 'Revoke' : 'Reject'}
        </Button>
        <Button
          type="button"
          variant="danger"
          className="!py-1.5 !text-xs"
          onClick={() => openDelete(org)}
        >
          Delete
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description="Create and manage tenant organizations across the platform."
        actions={
          <>
            {pendingTotal > 0 ? (
              <Link href="/approvals">
                <Badge tone="warn">{pendingTotal} pending approval</Badge>
              </Link>
            ) : null}
            <Button type="button" onClick={openCreate}>
              New organization
            </Button>
          </>
        }
      />

      {listQuery.isError ? (
        <ErrorBanner
          message={
            listQuery.error instanceof ApiError
              ? listQuery.error.message
              : 'Failed to load organizations'
          }
        />
      ) : null}

      <SectionCard title="Filters">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Search">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, address, contact…"
            />
          </Field>
          <Field label="Type">
            <Select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as TypeFilter)
                setPage(1)
              }}
            >
              <option value="all">All types</option>
              <option value="internal">Internal</option>
              <option value="customer">Customer</option>
            </Select>
          </Field>
          <Field label="Approval">
            <Select
              value={approvedFilter}
              onChange={(e) => {
                setApprovedFilter(e.target.value as ApprovedFilter)
                setPage(1)
              }}
            >
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
            </Select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Organizations"
        description={
          pagination
            ? `Page ${pagination.page} of ${Math.max(1, pagination.totalPages)} · ${pagination.total} total`
            : undefined
        }
      >
        {listQuery.isLoading ? (
          <LoadingBlock label="Loading organizations…" />
        ) : orgs.length === 0 ? (
          <EmptyState
            title="No organizations found"
            body="Adjust filters or create a new organization."
            action={
              <Button type="button" variant="secondary" onClick={openCreate}>
                Create organization
              </Button>
            }
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {orgs.map((org) => (
                <div
                  key={org.id}
                  className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/workspace?org=${encodeURIComponent(org.id)}`}
                        className="truncate font-semibold text-[var(--ink)] hover:text-[var(--brand)] hover:underline"
                      >
                        {org.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{orgKindLabel(org)}</p>
                    </div>
                    <Badge tone={org.isApproved ? 'ok' : 'warn'}>
                      {org.isApproved ? 'Approved' : 'Pending'}
                    </Badge>
                  </div>
                  <div className="mt-3">{renderRowActions(org)}</div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org) => (
                    <tr key={org.id} className="hover:bg-[var(--elevate)]">
                      <Td className="font-semibold">
                        <Link
                          href={`/workspace?org=${encodeURIComponent(org.id)}`}
                          className="text-[var(--ink)] hover:text-[var(--brand)] hover:underline"
                        >
                          {org.name}
                        </Link>
                      </Td>
                      <Td>{orgKindLabel(org)}</Td>
                      <Td>
                        <Badge tone={org.isApproved ? 'ok' : 'warn'}>
                          {org.isApproved ? 'Approved' : 'Pending'}
                        </Badge>
                      </Td>
                      <Td>{renderRowActions(org)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            {pagination && pagination.totalPages > 1 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--muted)]">
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
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <Dialog
        open={createOpen}
        title="Create organization"
        wide
        onClose={() => {
          setCreateOpen(false)
          setFormError('')
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCreateOpen(false)
                setFormError('')
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form="org-create-form" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create organization'}
            </Button>
          </>
        }
      >
        <form id="org-create-form" onSubmit={onCreateSubmit} className="space-y-4">
          {renderOrgFields({ inviteRequired: true, showLinkInternal: true })}
          {formError ? <ErrorBanner message={formError} /> : null}
        </form>
      </Dialog>

      <Dialog
        open={editOpen}
        title={selectedOrg ? `Edit ${selectedOrg.name}` : 'Edit organization'}
        wide
        onClose={() => {
          setEditOpen(false)
          setSelectedOrg(null)
          setFormError('')
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditOpen(false)
                setSelectedOrg(null)
                setFormError('')
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!selectedOrg || saveInviteMut.isPending || updateMut.isPending}
              onClick={() => {
                if (!selectedOrg) return
                setFormError('')
                saveInviteMut.mutate({ id: selectedOrg.id, org: selectedOrg })
              }}
            >
              {saveInviteMut.isPending ? 'Inviting…' : 'Save & invite'}
            </Button>
            <Button
              type="submit"
              form="org-edit-form"
              disabled={updateMut.isPending || saveInviteMut.isPending}
            >
              {updateMut.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        <form id="org-edit-form" onSubmit={onEditSubmit} className="space-y-4">
          {renderOrgFields({ inviteRequired: false, showLinkInternal: false })}
          {formError ? <ErrorBanner message={formError} /> : null}
        </form>
      </Dialog>

      <Dialog
        open={deleteOpen}
        title="Delete organization"
        onClose={() => {
          setDeleteOpen(false)
          setSelectedOrg(null)
          setFormError('')
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDeleteOpen(false)
                setSelectedOrg(null)
                setFormError('')
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!selectedOrg || deleteMut.isPending}
              onClick={() => {
                if (selectedOrg) deleteMut.mutate(selectedOrg.id)
              }}
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--muted)]">
          Delete{' '}
          <span className="font-semibold text-[var(--ink)]">{selectedOrg?.name ?? 'this org'}</span>
          ? This cannot be undone.
        </p>
        {formError ? (
          <div className="mt-4">
            <ErrorBanner message={formError} />
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
