'use client'

import { useNavigate } from '@/lib/nav-hooks'
import { api, when } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Alert, Empty, PageHeader } from '@/components/ui'
import { useFetch } from '@/lib/hooks'

// Where each kind of alert should take you.
function target(n, role) {
  const landlord = role === 'landlord'
  switch (n.event) {
    case 'listing_pending_review': return '/admin?tab=listings'
    case 'verification_pending': return '/admin?tab=verification'
    case 'document_approved': case 'document_rejected': case 'verification_updated': return '/verification'
    case 'application_received': return '/landlord'
    case 'enquiry_received': return '/landlord?tab=enquiries'
    case 'viewing_requested': return '/landlord?tab=viewings'
    case 'listing_approved': case 'listing_rejected': return '/landlord?tab=listings'
    case 'saved_search_match': return n.related_id ? `/listings/${n.related_id}` : '/'
    case 'application_accepted': case 'application_rejected': case 'acceptance_expired':
    case 'acceptance_declined': case 'placement_confirmed': case 'contacts_released':
    case 'payment_received': case 'placement_cancelled':
      return landlord ? '/landlord?tab=deals' : '/deals'
    default: return null
  }
}

const initial = (n) => (n.event || '?').replace(/_/g, ' ')[0].toUpperCase()

export default function Notifications() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { data, error, reload } = useFetch('/me/notifications/')
  const refreshBadge = () => window.dispatchEvent(new Event('rp:refresh-alerts'))

  const markRead = async (n) => {
    try { await api(`/me/notifications/${n.id}/read/`, { method: 'POST' }) } catch { /* the list reloads below */ }
    refreshBadge()
  }
  const open = async (n) => {
    if (!n.read_at) await markRead(n)
    const to = target(n, user.role)
    if (to) nav(to); else reload()
  }
  const markOnly = async (e, n) => { e.stopPropagation(); await markRead(n); reload() }
  const markAll = async () => {
    try { await api('/me/notifications/read-all/', { method: 'POST' }) } catch { /* ignore */ }
    refreshBadge(); reload()
  }

  const unread = data?.results.filter((n) => !n.read_at) || []
  const earlier = data?.results.filter((n) => n.read_at) || []
  const card = (n) => (
    <div key={n.id} className={`card clickable notif ${n.read_at ? '' : 'unread'}`} onClick={() => open(n)}>
      <span className="icon">{initial(n)}</span>
      <div className="grow">
        <strong>{n.title}</strong>
        <div>{n.body}</div>
        <small className="muted">{when(n.created_at)}</small>
      </div>
      {!n.read_at && <button className="btn ghost" onClick={(e) => markOnly(e, n)}>Mark as read</button>}
    </div>
  )

  return (
    <div className="stack">
      <PageHeader title="Alerts" subtitle={unread.length ? `${unread.length} unread` : 'You are all caught up.'}>
        {unread.length > 0 && <button className="btn ghost" onClick={markAll}>Mark all as read</button>}
      </PageHeader>
      <Alert error={error} />
      {data && data.results.length === 0 && <Empty>No alerts yet. Updates about your applications, listings and payments will appear here.</Empty>}
      {unread.map(card)}
      {earlier.length > 0 && <h3 className="muted">Earlier</h3>}
      {earlier.map(card)}
    </div>
  )
}
