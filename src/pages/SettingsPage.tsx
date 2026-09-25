import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, SA } from '../lib/api'
import { Badge, Button, ErrorBanner, Field, Input, LoadingBlock, PageHeader, SectionCard } from '../components/ui'

type HubConnection = {
  tracking_base_url: string
  tracking_api_key_set: boolean
  tracking_api_key_masked?: string | null
  ingest_base_url: string
  ingest_key_set: boolean
  ingest_key_masked?: string | null
  tracking_ready: boolean
  ingest_ready: boolean
  tracking_base_url_source: string
  tracking_api_key_source: string
}

export function SettingsPage() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['hub-connection'],
    queryFn: () => api.get<HubConnection>(SA.hubConnection),
  })

  const [trackingUrl, setTrackingUrl] = useState('')
  const [trackingKey, setTrackingKey] = useState('')
  const [ingestUrl, setIngestUrl] = useState('')
  const [ingestKey, setIngestKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!query.data) return
    setTrackingUrl(query.data.tracking_base_url || '')
    setIngestUrl(query.data.ingest_base_url || '')
    setTrackingKey('')
    setIngestKey('')
  }, [query.data])

  const saveMut = useMutation({
    mutationFn: () =>
      api.put<HubConnection>(SA.hubConnection, {
        tracking_base_url: trackingUrl,
        ingest_base_url: ingestUrl,
        ...(trackingKey.trim() ? { tracking_api_key: trackingKey.trim() } : {}),
        ...(ingestKey.trim() ? { ingest_key: ingestKey.trim() } : {}),
      }),
    onSuccess: () => {
      setMessage('Connection saved')
      setError('')
      setTrackingKey('')
      setIngestKey('')
      void qc.invalidateQueries({ queryKey: ['hub-connection'] })
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Save failed')
      setMessage('')
    },
  })

  const testMut = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; message: string; carrier_count?: number }>(
        SA.hubConnectionTest,
      ),
    onSuccess: (r) => {
      setMessage(r.ok ? `${r.message} (${r.carrier_count ?? 0} carriers)` : r.message)
      setError(r.ok ? '' : r.message)
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Test failed')
      setMessage('')
    },
  })

  function onSave(e: FormEvent) {
    e.preventDefault()
    saveMut.mutate()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        description="Connect the platform backend to hub tracking-api. Secrets are stored server-side and never returned in full."
        actions={
          query.data ? (
            <Badge tone={query.data.tracking_ready ? 'ok' : 'warn'}>
              {query.data.tracking_ready ? 'Tracking ready' : 'Tracking not ready'}
            </Badge>
          ) : null
        }
      />

      {query.isError ? (
        <ErrorBanner
          message={query.error instanceof ApiError ? query.error.message : 'Failed to load'}
        />
      ) : null}

      {query.isLoading ? (
        <LoadingBlock label="Loading connection…" />
      ) : (
        <form onSubmit={onSave} className="space-y-4">
          <SectionCard title="Hub tracking" description="Primary tracking-api endpoint and API key.">
            <div className="space-y-4">
              <Field label="Tracking base URL">
                <Input
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="http://localhost:8080"
                />
              </Field>
              <Field
                label={
                  query.data?.tracking_api_key_set
                    ? `API key (set: ${query.data.tracking_api_key_masked || '••••'})`
                    : 'API key'
                }
              >
                <Input
                  type="password"
                  value={trackingKey}
                  onChange={(e) => setTrackingKey(e.target.value)}
                  placeholder={query.data?.tracking_api_key_set ? 'Leave blank to keep' : 'ff_…'}
                  autoComplete="off"
                />
              </Field>
              <p className="text-xs text-[var(--muted)]">
                Source — URL: {query.data?.tracking_base_url_source} · key:{' '}
                {query.data?.tracking_api_key_source}
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Hub ingest" description="Optional ingest endpoint for event push.">
            <div className="space-y-4">
              <Field label="Ingest base URL">
                <Input
                  value={ingestUrl}
                  onChange={(e) => setIngestUrl(e.target.value)}
                  placeholder="http://localhost:8082"
                />
              </Field>
              <Field
                label={
                  query.data?.ingest_key_set
                    ? `Ingest key (set: ${query.data.ingest_key_masked || '••••'})`
                    : 'Ingest key'
                }
              >
                <Input
                  type="password"
                  value={ingestKey}
                  onChange={(e) => setIngestKey(e.target.value)}
                  placeholder={query.data?.ingest_key_set ? 'Leave blank to keep' : ''}
                  autoComplete="off"
                />
              </Field>
            </div>
          </SectionCard>

          {error ? <ErrorBanner message={error} /> : null}
          {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="submit" className="w-full sm:w-auto" disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Saving…' : 'Save connection'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={testMut.isPending}
              onClick={() => testMut.mutate()}
            >
              {testMut.isPending ? 'Testing…' : 'Test connection'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
