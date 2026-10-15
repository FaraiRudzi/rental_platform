'use client'

import Link from '@/components/Link'
import { api } from '@/lib/api'
import { Alert, Empty, PageHeader } from '@/components/ui'
import { useAction, useFetch } from '@/lib/hooks'

export default function SavedSearches() {
  const { data, error, reload } = useFetch('/me/saved-searches/')
  const act = useAction(reload)
  const summary = (f) => Object.entries(f || {}).map(([k, v]) => `${k.replace('_', ' ')}: ${v}`).join(' · ') || 'All homes'

  return (
    <div className="stack">
      <PageHeader title="Saved searches" subtitle="We alert you when a new home matches." />
      <Alert error={error || act.error} />
      {data?.length === 0 && <Empty>No saved searches yet. Use "Save search" on the <Link to="/">search page</Link>.</Empty>}
      {data?.map((s) => (
        <div className="card row between" key={s.id}>
          <div><strong>{s.name || 'Search'}</strong><div className="muted small">{summary(s.filters)}</div></div>
          <div className="row gap">
            <Link className="btn ghost" to={`/?${new URLSearchParams(s.filters)}`}>Run</Link>
            <button className="btn danger" onClick={() => act.run(() => api(`/me/saved-searches/${s.id}/`, { method: 'DELETE' }))}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  )
}
