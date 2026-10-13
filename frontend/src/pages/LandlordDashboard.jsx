import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, money, when } from '../api'
import { useAuth } from '../auth'
import { Alert, Badge, Empty, PageHeader } from '../components/ui'
import Placements from '../components/Placements'
import { useAction, useFetch } from '../hooks'

const TABS = [['applications', 'Applications'], ['listings', 'My listings'], ['enquiries', 'Enquiries'], ['viewings', 'Viewings'], ['deals', 'Deals & fees']]

export default function LandlordDashboard() {
  const { user } = useAuth()
  const [sp] = useSearchParams()
  const [tab, setTab] = useState(TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'applications')
  return (
    <div className="stack">
      <PageHeader title={`Welcome, ${user.full_name.split(' ')[0]}`} subtitle="Manage your listings, applicants and fees.">
        <Link className="btn" to="/landlord/new">+ Add listing</Link>
      </PageHeader>
      {user.verification_status !== 'verified' && (
        <div className="note">Your account is <strong>{user.verification_status}</strong>. Verified landlords get a badge that tenants trust. Upload your ID and proof of ownership via your admin contact.</div>
      )}
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'applications' && <Applications />}
      {tab === 'listings' && <Listings />}
      {tab === 'enquiries' && <Enquiries />}
      {tab === 'viewings' && <Viewings />}
      {tab === 'deals' && <Placements role="landlord" />}
    </div>
  )
}

function Applications() {
  const { data, error, reload } = useFetch('/landlord/applications/')
  const act = useAction(reload)
  return (
    <div className="stack">
      <Alert error={error || act.error} ok={act.ok} />
      {data?.length === 0 && <Empty>No applications yet.</Empty>}
      {data?.map((a) => (
        <div className="card" key={a.id}>
          <div className="row between"><h3>{a.tenant.name} {a.tenant.verified && <span className="badge ok">Verified</span>}</h3><Badge status={a.status} /></div>
          <p className="muted">{a.listing.title} · {money(a.listing.rent, a.listing.currency)} · applied {when(a.created_at)}</p>
          {a.message && <p className="prewrap">{a.message}</p>}
          {a.desired_move_in && <p className="muted small">Wants to move in: {a.desired_move_in}</p>}
          {['submitted', 'under_review'].includes(a.status) && (
            <div className="row gap">
              <button className="btn" disabled={act.busy} onClick={() => act.run(() => api(`/landlord/applications/${a.id}/accept/`, { method: 'POST' }), 'Accepted. The tenant has been notified on every channel.')}>Accept</button>
              <button className="btn danger" disabled={act.busy} onClick={() => act.run(() => api(`/landlord/applications/${a.id}/reject/`, { method: 'POST', body: {} }), 'Rejected.')}>Reject</button>
            </div>
          )}
          {a.status === 'accepted' && <p className="muted">Waiting for the tenant to confirm by {when(a.respond_by)}.</p>}
          {a.status === 'confirmed' && <p className="muted">Confirmed. See "Deals &amp; fees" to pay your share.</p>}
        </div>
      ))}
    </div>
  )
}

function Listings() {
  const { data, error, reload } = useFetch('/landlord/listings/')
  const act = useAction(reload)
  return (
    <div className="stack">
      <Alert error={error || act.error} ok={act.ok} />
      {data?.length === 0 && <Empty>No listings yet. Add your first home.</Empty>}
      {data?.map((l) => (
        <div className="card" key={l.id}>
          <div className="row between"><h3>{l.title}</h3><Badge status={l.status} /></div>
          <p className="muted">{money(l.rent, l.currency)} · {l.bedrooms} bed · {l.address_line} · {l.images.length} photos · {l.application_count} applications</p>
          {l.rejection_reason && <div className="alert bad">Needs changes: {l.rejection_reason}</div>}
          <div className="row gap wrap">
            {['draft', 'rejected'].includes(l.status) && <Link className="btn ghost" to={`/landlord/edit/${l.id}`}>Edit / add photos</Link>}
            {['draft', 'rejected'].includes(l.status) && <button className="btn" disabled={act.busy} onClick={() => act.run(() => api(`/landlord/listings/${l.id}/submit/`, { method: 'POST' }), 'Submitted for review.')}>Submit for review</button>}
            {l.status === 'published' && <Link className="btn ghost" to={`/listings/${l.id}`}>View public page</Link>}
            {!['reserved', 'let', 'archived'].includes(l.status) && <button className="btn danger" onClick={() => act.run(() => api(`/landlord/listings/${l.id}/archive/`, { method: 'POST' }), 'Archived.')}>Archive</button>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Enquiries() {
  const { data, error, reload } = useFetch('/landlord/enquiries/')
  const act = useAction(reload)
  const [replies, setReplies] = useState({})
  return (
    <div className="stack">
      <Alert error={error || act.error} />
      {data?.length === 0 && <Empty>No enquiries.</Empty>}
      {data?.map((e) => (
        <div className="card" key={e.id}>
          <strong>{e.tenant_name}</strong> <span className="muted">about {e.listing_title} · {when(e.created_at)}</span>
          <p className="prewrap">{e.message}</p>
          {e.reply ? <p className="note">Your reply: {e.reply}</p> : (
            <div className="row gap">
              <input value={replies[e.id] || ''} onChange={(ev) => setReplies({ ...replies, [e.id]: ev.target.value })} placeholder="Write a reply" />
              <button className="btn" disabled={act.busy || !replies[e.id]} onClick={() => act.run(() => api(`/landlord/enquiries/${e.id}/reply/`, { method: 'POST', body: { reply: replies[e.id] } }))}>Reply</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Viewings() {
  const { data, error, reload } = useFetch('/landlord/viewings/')
  const act = useAction(reload)
  const set = (id, status) => act.run(() => api(`/landlord/viewings/${id}/update/`, { method: 'POST', body: { status } }))
  return (
    <div className="stack">
      <Alert error={error || act.error} />
      {data?.length === 0 && <Empty>No viewing requests.</Empty>}
      {data?.map((v) => (
        <div className="card row between" key={v.id}>
          <div><strong>{v.tenant_name}</strong> · {v.listing_title}<div className="muted">{when(v.proposed_at)}</div></div>
          <div className="row gap"><Badge status={v.status} />
            {v.status === 'requested' && <><button className="btn" onClick={() => set(v.id, 'confirmed')}>Confirm</button><button className="btn danger" onClick={() => set(v.id, 'cancelled')}>Decline</button></>}
            {v.status === 'confirmed' && <button className="btn ghost" onClick={() => set(v.id, 'completed')}>Mark done</button>}
          </div>
        </div>
      ))}
    </div>
  )
}
