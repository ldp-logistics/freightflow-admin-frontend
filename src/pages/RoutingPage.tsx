import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, ApiError, SA, unwrapList } from '../lib/api'
import { normalizeOrg, pick, pickBool, pickStr, type NormalizedOrg } from '../lib/normalize'
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
  Textarea,
} from '../components/ui'

type RuleRow = Record<string, unknown>
type ConditionRow = Record<string, unknown>
type ConnectionRow = Record<string, unknown>

const OPERATORS = [
  { value: 'equals_normalized', label: 'Equals (normalized)' },
  { value: 'equals', label: 'Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'in', label: 'In list' },
  { value: 'exists', label: 'Exists' },
] as const

type Operator = (typeof OPERATORS)[number]['value']

const DEFAULT_TEST_PAYLOAD = `{
  "payerOrganization": {
    "name": "EXAMPLE CUSTOMER"
  },
  "customer": {
    "name": "EXAMPLE CUSTOMER"
  }
}`

function ruleConditions(rule: RuleRow): ConditionRow[] {
  const c = pick<unknown[]>(rule, 'conditions', 'conditions')
  return Array.isArray(c) ? (c as ConditionRow[]) : []
}

export function RoutingPage() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [priority, setPriority] = useState('100')
  const [targetOrgId, setTargetOrgId] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [description, setDescription] = useState('')
  const [path, setPath] = useState('payerOrganization.name')
  const [operator, setOperator] = useState<Operator>('equals_normalized')
  const [value, setValue] = useState('')

  const [testPayload, setTestPayload] = useState(DEFAULT_TEST_PAYLOAD)
  const [testResult, setTestResult] = useState<unknown>(null)
  const [testError, setTestError] = useState('')

  const orgsQuery = useQuery({
    queryKey: ['routing-orgs'],
    queryFn: async () => {
      const payload = await api.get(`${SA.orgs}?approved=true&page_size=50`)
      return unwrapList<unknown>(payload).map(normalizeOrg)
    },
  })
  const orgs: NormalizedOrg[] = orgsQuery.data ?? []

  const rulesQuery = useQuery({
    queryKey: ['assignment-rules'],
    queryFn: async () => unwrapList<RuleRow>(await api.get(SA.assignmentRules)),
  })

  const connectionsQuery = useQuery({
    queryKey: ['source-connections'],
    queryFn: async () => unwrapList<ConnectionRow>(await api.get(SA.sourceConnections)),
  })

  function resetForm() {
    setName('')
    setPriority('100')
    setTargetOrgId('')
    setEnabled(true)
    setDescription('')
    setPath('payerOrganization.name')
    setOperator('equals_normalized')
    setValue('')
    setError('')
  }

  const createMut = useMutation({
    mutationFn: () =>
      api.post(SA.assignmentRules, {
        name: name.trim(),
        enabled,
        priority: Number(priority) || 100,
        target_org_id: targetOrgId,
        description: description.trim() || undefined,
        match_mode: 'all',
        conditions: [
          {
            path: path.trim(),
            operator,
            value: operator === 'exists' ? null : value,
            normalize: true,
            sort_order: 0,
          },
        ],
      }),
    onSuccess: () => {
      resetForm()
      setCreateOpen(false)
      void qc.invalidateQueries({ queryKey: ['assignment-rules'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Create failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(SA.assignmentRule(id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assignment-rules'] }),
  })

  const testMut = useMutation({
    mutationFn: async () => {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(testPayload) as Record<string, unknown>
      } catch {
        throw new ApiError(400, 'Test payload must be valid JSON')
      }
      return api.post<unknown>(SA.assignmentRuleTest, {
        payload,
        source_type: 'TAI',
      })
    },
    onSuccess: (r) => {
      setTestResult(r)
      setTestError('')
    },
    onError: (e) => {
      setTestResult(null)
      setTestError(e instanceof ApiError ? e.message : 'Test failed')
    },
  })

  const rules = rulesQuery.data ?? []
  const connections = connectionsQuery.data ?? []

  function orgLabel(id: string) {
    return orgs.find((o) => o.id === id)?.name ?? id
  }

  function onCreateSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    createMut.mutate()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global routing"
        description="Platform assignment rules and source connections."
        actions={
          <Button type="button" className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
            Add rule
          </Button>
        }
      />

      <SectionCard title="Rules" description={rules.length ? `${rules.length} rules` : undefined}>
        {rulesQuery.isLoading ? (
          <LoadingBlock label="Loading rules…" />
        ) : rules.length === 0 ? (
          <EmptyState title="No assignment rules" body="Add a rule to route inbound payloads by field match." />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {rules.map((r) => {
                const id = pickStr(r, 'id', 'id')
                const conds = ruleConditions(r)
                return (
                  <div
                    key={id}
                    className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]/40 p-3"
                  >
                    <p className="font-semibold">{pickStr(r, 'name', 'name', id.slice(0, 8))}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      → {orgLabel(pickStr(r, 'targetOrgId', 'target_org_id'))} · priority{' '}
                      {pickStr(r, 'priority', 'priority', '—')}
                    </p>
                    <p className="mt-1 text-xs font-mono text-[var(--muted)]">
                      {conds[0]
                        ? `${pickStr(conds[0], 'path', 'path')} ${pickStr(conds[0], 'operator', 'operator')}`
                        : '—'}
                    </p>
                    <div className="mt-2">
                      <Badge tone={pickBool(r, 'enabled', 'enabled', true) ? 'ok' : 'neutral'}>
                        {pickBool(r, 'enabled', 'enabled', true) ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      className="mt-3 w-full !py-1.5 !text-xs"
                      onClick={() => deleteMut.mutate(id)}
                    >
                      Delete
                    </Button>
                  </div>
                )
              })}
            </div>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Target org</Th>
                    <Th>Priority</Th>
                    <Th>Condition</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const id = pickStr(r, 'id', 'id')
                    const conds = ruleConditions(r)
                    const c0 = conds[0]
                    return (
                      <tr key={id} className="hover:bg-[var(--elevate)]">
                        <Td className="font-semibold">{pickStr(r, 'name', 'name', id.slice(0, 8))}</Td>
                        <Td>{orgLabel(pickStr(r, 'targetOrgId', 'target_org_id'))}</Td>
                        <Td>{pickStr(r, 'priority', 'priority', '—')}</Td>
                        <Td className="font-mono text-xs">
                          {c0 ? (
                            <>
                              {pickStr(c0, 'path', 'path')} {pickStr(c0, 'operator', 'operator')}{' '}
                              {pickStr(c0, 'value', 'value')}
                            </>
                          ) : (
                            '—'
                          )}
                        </Td>
                        <Td>
                          <Badge tone={pickBool(r, 'enabled', 'enabled', true) ? 'ok' : 'neutral'}>
                            {pickBool(r, 'enabled', 'enabled', true) ? 'On' : 'Off'}
                          </Badge>
                        </Td>
                        <Td>
                          <Button
                            type="button"
                            variant="danger"
                            className="!py-1.5 !text-xs"
                            onClick={() => deleteMut.mutate(id)}
                          >
                            Delete
                          </Button>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Source connections" description={`${connections.length} connections`}>
        {connectionsQuery.isLoading ? (
          <LoadingBlock label="Loading connections…" />
        ) : connections.length === 0 ? (
          <EmptyState title="No source connections" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Org</Th>
                <Th>Active</Th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => {
                const id = pickStr(c, 'id', 'id')
                return (
                  <tr key={id} className="hover:bg-[var(--elevate)]">
                    <Td className="font-semibold">{pickStr(c, 'name', 'name', id.slice(0, 8))}</Td>
                    <Td>{pickStr(c, 'sourceType', 'source_type', '—')}</Td>
                    <Td>{pickStr(c, 'orgName', 'org_name', '—')}</Td>
                    <Td>
                      <Badge tone={pickBool(c, 'active', 'active', true) ? 'ok' : 'neutral'}>
                        {pickBool(c, 'active', 'active', true) ? 'Yes' : 'No'}
                      </Badge>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>

      <SectionCard
        title="Test assignment rules"
        description="Paste a sample TAI JSON payload; evaluates against enabled global rules."
      >
        <Field label="Payload (JSON)">
          <Textarea
            rows={8}
            className="font-mono text-xs"
            value={testPayload}
            onChange={(e) => setTestPayload(e.target.value)}
          />
        </Field>
        {testError ? (
          <div className="mt-3">
            <ErrorBanner message={testError} />
          </div>
        ) : null}
        <Button
          type="button"
          className="mt-3 w-full sm:w-auto"
          disabled={testMut.isPending}
          onClick={() => testMut.mutate()}
        >
          {testMut.isPending ? 'Running…' : 'Run test'}
        </Button>
        {testResult != null ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]/60 p-3 text-xs">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        ) : null}
      </SectionCard>

      <Dialog
        open={createOpen}
        title="Create assignment rule"
        wide
        onClose={() => {
          setCreateOpen(false)
          resetForm()
        }}
        footer={
          <>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setCreateOpen(false)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="routing-create-form"
              disabled={createMut.isPending || !name.trim() || !targetOrgId || !path.trim()}
            >
              {createMut.isPending ? 'Creating…' : 'Create rule'}
            </Button>
          </>
        }
      >
        <form id="routing-create-form" onSubmit={onCreateSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rule name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Priority">
              <Input value={priority} onChange={(e) => setPriority(e.target.value)} />
            </Field>
            <Field label="Target organization">
              <Select
                value={targetOrgId}
                onChange={(e) => setTargetOrgId(e.target.value)}
                required
              >
                <option value="">Select org…</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end pb-1">
              <Checkbox checked={enabled} onChange={setEnabled} label="Enabled" />
            </div>
            <div className="sm:col-span-2">
              <Field label="Description">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="mb-3 text-sm font-semibold">Match condition</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Path">
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="payerOrganization.name"
                  required
                />
              </Field>
              <Field label="Operator">
                <Select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as Operator)}
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Value">
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    disabled={operator === 'exists'}
                    placeholder="Match value"
                  />
                </Field>
              </div>
            </div>
          </div>

          {error ? <ErrorBanner message={error} /> : null}
        </form>
      </Dialog>
    </div>
  )
}
