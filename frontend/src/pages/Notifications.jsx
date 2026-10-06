import { api, when } from '../api'
import { Alert, Empty } from '../components/ui'
import { useFetch } from '../hooks'

export default function Notifications() {
  const { data, error, reload } = useFetch('/me/notifications/')
  const read = async (n) => { if (!n.read_at) { await api(`/me/notifications/${n.id}/read/`, { method: 'POST' }); reload() } }
  return (
    <div className="stack">
      <h1>Alerts</h1>
      <Alert error={error} />
      {data?.results.length === 0 && <Empty>Nothing yet.</Empty>}
      {data?.results.map((n) => (
        <div key={n.id} className={`card clickable ${n.read_at ? '' : 'unread'}`} onClick={() => read(n)}>
          <strong>{n.title}</strong>
          <div>{n.body}</div>
          <small className="muted">{when(n.created_at)}</small>
        </div>
      ))}
    </div>
  )
}
