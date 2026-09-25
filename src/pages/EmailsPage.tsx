import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError, SA, unwrapList } from '../lib/api'
import { pick, pickStr } from '../lib/normalize'
import {
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
  Textarea,
} from '../components/ui'

type EmailLog = {
  id: string
  subject?: string
  recipient_email?: string
  status?: string
  notification_type?: string
  container_number?: string
  created_at?: string
}

function mapLog(raw: unknown): EmailLog {
  return {
    id: String(pick(raw, 'id', 'id') ?? ''),
    subject: pickStr(raw, 'subject', 'subject') || undefined,
    recipient_email: pickStr(raw, 'recipientEmail', 'recipient_email') || undefined,
    status: pickStr(raw, 'status', 'status') || undefined,
    notification_type: pickStr(raw, 'notificationType', 'notification_type') || undefined,
    container_number: pickStr(raw, 'containerNumber', 'container_number') || undefined,
    created_at: pickStr(raw, 'createdAt', 'created_at') || undefined,
  }
}

export function EmailsPage() {
  const [to, setTo] = useState('')
  const [template, setTemplate] = useState('pod_awaiting')
  const [containerNumber, setContainerNumber] = useState('')
  const [sendMsg, setSendMsg] = useState('')
  const [sendErr, setSendErr] = useState('')

  const logsQuery = useQuery({
    queryKey: ['email-logs'],
    queryFn: async () => unwrapList(await api.get(SA.emails)).map(mapLog),
  })

  const templatesQuery = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<unknown>(SA.emailTemplates),
  })

  const sendMut = useMutation({
    mutationFn: () =>
      api.post(SA.emailSend, {
        to_emails: to
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        template_name: template,
        container_number: containerNumber.trim() || undefined,
      }),
    onSuccess: () => {
      setSendMsg('Email queued/sent')
      setSendErr('')
      void logsQuery.refetch()
    },
    onError: (e) => {
      setSendErr(e instanceof ApiError ? e.message : 'Send failed')
      setSendMsg('')
    },
  })

  const logs = logsQuery.data || []
  const templateKeys =
    templatesQuery.data && typeof templatesQuery.data === 'object'
      ? Object.keys(templatesQuery.data as Record<string, unknown>)
      : [
          'pod_awaiting',
          'pod_full_out',
          'rail_awaiting',
          'approaching_lfd',
          'today_lfd',
          'demurrage_alert',
          'missing_mbl',
          'wrong_mbl',
        ]

  return (
    <div className="space-y-6">
      <PageHeader title="Emails" description="Platform email logs and manual test send." />

      {logsQuery.isError ? (
        <ErrorBanner
          message={logsQuery.error instanceof ApiError ? logsQuery.error.message : 'Failed'}
        />
      ) : null}

      <SectionCard title="Send test email" description="Queues a template to one or more addresses.">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            sendMut.mutate()
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label="To (comma-separated)">
            <Input value={to} onChange={(e) => setTo(e.target.value)} required />
          </Field>
          <Field label="Template">
            <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
              {templateKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Container number (optional)">
            <Input value={containerNumber} onChange={(e) => setContainerNumber(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={sendMut.isPending}>
              {sendMut.isPending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </form>
        {sendErr ? (
          <div className="mt-3">
            <ErrorBanner message={sendErr} />
          </div>
        ) : null}
        {sendMsg ? <p className="mt-3 text-sm text-[var(--ok)]">{sendMsg}</p> : null}
      </SectionCard>

      <SectionCard title="Recent logs" description={logs.length ? `Showing ${Math.min(logs.length, 100)}` : undefined}>
        {logsQuery.isLoading ? (
          <LoadingBlock label="Loading email logs…" />
        ) : logs.length === 0 ? (
          <EmptyState title="No email logs" body="Sent platform emails will appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>To</Th>
                <Th>Subject / type</Th>
                <Th>Container</Th>
                <Th>Status</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 100).map((e) => (
                <tr key={e.id} className="hover:bg-[var(--elevate)]">
                  <Td>{e.recipient_email || '—'}</Td>
                  <Td>{e.subject || e.notification_type || '—'}</Td>
                  <Td className="font-mono text-xs">{e.container_number || '—'}</Td>
                  <Td>{e.status || '—'}</Td>
                  <Td className="text-xs text-[var(--muted)]">
                    {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="Templates (raw)">
        <Textarea
          readOnly
          rows={8}
          className="font-mono text-xs"
          value={JSON.stringify(templatesQuery.data ?? null, null, 2)}
        />
      </SectionCard>
    </div>
  )
}
