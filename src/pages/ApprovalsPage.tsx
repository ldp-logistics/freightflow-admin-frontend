import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError, SA, unwrapList } from '../lib/api'
import { normalizeOrg, orgKindLabel, type NormalizedOrg } from '../lib/normalize'
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingBlock,
  PageHeader,
  SectionCard,
  Select,
  Table,
  Td,
  Th,
} from '../components/ui'

type ApprovalFilter = 'pending' | 'approved' | 'all'

export function ApprovalsPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<ApprovalFilter>('pending')

  const query = useQuery({
    queryKey: ['org-approvals', filter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        page_size: '50',
      })
      if (filter === 'pending') params.set('approved', 'false')
      if (filter === 'approved') params.set('approved', 'true')
      const payload = await api.get(`${SA.orgs}?${params}`)
      return unwrapList<unknown>(payload).map(normalizeOrg)
    },
  })

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['org-approvals'] })
    void qc.invalidateQueries({ queryKey: ['organizations'] })
    void qc.invalidateQueries({ queryKey: ['organizations-pending-count'] })
  }

  const approveMut = useMutation({
    mutationFn: (id: string) => api.post(SA.orgApprove(id)),
    onSuccess: invalidate,
  })

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.post(SA.orgReject(id)),
    onSuccess: invalidate,
  })

  const orgs = query.data ?? []

  const filterDescription =
    filter === 'pending'
      ? 'Organizations awaiting platform approval.'
      : filter === 'approved'
        ? 'Organizations that have been approved.'
        : 'All organizations (approval status shown per row).'

  function renderActions(org: NormalizedOrg) {
    if (!org.isApproved) {
      return (
        <Button
          type="button"
          className="!py-1.5 !text-xs"
          disabled={approveMut.isPending}
          onClick={() => approveMut.mutate(org.id)}
        >
          Approve
        </Button>
      )
    }
    return (
      <Button
        type="button"
        variant="secondary"
        className="!py-1.5 !text-xs"
        disabled={revokeMut.isPending}
        onClick={() => revokeMut.mutate(org.id)}
      >
        Revoke
      </Button>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" description={filterDescription} />

      {query.isError ? (
        <ErrorBanner
          message={query.error instanceof ApiError ? query.error.message : 'Failed to load'}
        />
      ) : null}

      <SectionCard title="Filter">
        <div className="max-w-xs">
          <Field label="Show">
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as ApprovalFilter)}
            >
              <option value="pending">Pending (not approved)</option>
              <option value="approved">Approved</option>
              <option value="all">All</option>
            </Select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title={filter === 'pending' ? 'Pending queue' : 'Organizations'}
        description={orgs.length ? `${orgs.length} on this page` : undefined}
      >
        {query.isLoading ? (
          <LoadingBlock label="Loading approvals…" />
        ) : orgs.length === 0 ? (
          <EmptyState
            title={
              filter === 'pending'
                ? 'No pending approvals'
                : filter === 'approved'
                  ? 'No approved organizations'
                  : 'No organizations'
            }
            body={
              filter === 'pending'
                ? 'New organizations will appear here until they are approved.'
                : 'Try a different filter or create organizations from the Organizations page.'
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
                      <p className="truncate font-semibold">{org.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{orgKindLabel(org)}</p>
                    </div>
                    <Badge tone={org.isApproved ? 'ok' : 'warn'}>
                      {org.isApproved ? 'Approved' : 'Pending'}
                    </Badge>
                  </div>
                  <div className="mt-3">{renderActions(org)}</div>
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
                      <Td className="font-semibold">{org.name}</Td>
                      <Td>{orgKindLabel(org)}</Td>
                      <Td>
                        <Badge tone={org.isApproved ? 'ok' : 'warn'}>
                          {org.isApproved ? 'Approved' : 'Pending'}
                        </Badge>
                      </Td>
                      <Td>{renderActions(org)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
