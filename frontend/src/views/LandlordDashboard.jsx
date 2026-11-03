'use client'
import { useState } from 'react'
import { useConfirm } from '@/components/ConfirmDialog'
import Icon from '@/components/Icons'
import Link from '@/components/Link'
import Placements from '@/components/Placements'
import { Alert, Avatar, Badge, EmptyState, PageHeader, StatTile } from '@/components/ui'
import { api, money, when } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtDay, timeAgo } from '@/lib/format'
import { useFetch } from '@/lib/hooks'
import { useSearchParams } from '@/lib/nav-hooks'
import { toast } from '@/lib/toast'

const TABS = [['applications', 'Applications'], ['listings', 'My listings'], ['enquiries', 'Questions'], ['viewings', 'Viewings'], ['deals', 'Deals & fees']]
const GROUPS = {
  action: ['submitted', 'under_review'],
  progress: ['accepted', 'confirmed'],
  closed: ['rejected', 'declined', 'expired', 'withdrawn'],
}

// Runs an action, shows a message, then refreshes the lists.
function useDo(reload) {
  const [busy, setBusy] = useState(false)
  const run = async (fn, ok) => {
    setBusy(true)
    try { await fn(); if (ok) toast.success(ok); reload() } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return { busy, run }
}

export default function LandlordDashboard() {
  const { user } = useAuth()
  const [sp] = useSearchParams()
  const [tab, setTab] = useState(TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'applications')
  const listings = useFetch('/landlord/listings/')
  const apps = useFetch('/landlord/applications/')
  const enquiries = useFetch('/landlord/enquiries/')
  const viewings = useFetch('/landlord/viewings/')
  const reload = () => { listings.reload(); apps.reload(); enquiries.reload(); viewings.reload() }

  const n = (list, pred) => (list.data || []).filter(pred).length
  const counts = {
    published: n(listings, (l) => l.status === 'published'),
    review: n(listings, (l) => l.status === 'pending_review'),
    newApps: n(apps, (a) => GROUPS.action.includes(a.status)),
    accepted: n(apps, (a) => a.status === 'accepted'),
    questions: n(enquiries, (e) => e.status === 'open'),
    viewReq: n(viewings, (v) => v.status === 'requested'),
  }
  const tabCount = { applications: counts.newApps, listings: 0, enquiries: counts.questions, viewings: counts.viewReq, deals: 0 }

  return (
    <div className="stack">
      <PageHeader title={`Welcome, ${user.full_name.split(' ')[0]}`} subtitle="Manage your listings, applicants and fees.">
        <Link className="btn" to="/landlord/new"><Icon name="plus" size={16} /> Add listing</Link>
      </PageHeader>

      {user.verification_status !== 'verified' && (
        <div className="note">Your account is <strong>{user.verification_status}</strong>. Verified landlords earn tenants&rsquo; trust. <Link to="/verification"><strong>{user.verification_status === 'pending' ? 'See your documents' : 'Upload your ID and proof of ownership'}</strong></Link>.</div>
      )}

      <div className="tiles">
        <StatTile icon="home" tone="ok" label="Homes live" value={counts.published} onClick={() => setTab('listings')} />
        <StatTile icon="clock" tone="warn" label="Waiting for review" value={counts.review} onClick={() => setTab('listings')} />
        <StatTile icon="user" label="New applications" value={counts.newApps} onClick={() => setTab('applications')} />
        <StatTile icon="check" label="Awaiting tenant" value={counts.accepted} onClick={() => setTab('applications')} />
        <StatTile icon="message" label="Open questions" value={counts.questions} onClick={() => setTab('enquiries')} />
        <StatTile icon="calendar" label="Viewing requests" value={counts.viewReq} onClick={() => setTab('viewings')} />
      </div>

      <div className="tabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{tabCount[k] > 0 && <span className="cnt">{tabCount[k]}</span>}</button>)}
      </div>

      {tab === 'applications' && <Applications state={apps} reload={reload} />}
      {tab === 'listings' && <Listings state={listings} reload={reload} />}
      {tab === 'enquiries' && <Questions state={enquiries} reload={reload} />}
      {tab === 'viewings' && <Viewings state={viewings} reload={reload} />}
      {tab === 'deals' && <Placements role="landlord" />}
    </div>
  )
}

function Applications({ state, reload }) {
  const { data, error } = state
  const confirm = useConfirm()
  const { busy, run } = useDo(reload)
  const [group, setGroup] = useState('action')
  const list = data || []
  const inGroup = (a, g) => (g === 'all' ? true : GROUPS[g].includes(a.status))
  const shown = list.filter((a) => inGroup(a, group))
  const tabs = [['action', 'Needs your decision'], ['progress', 'In progress'], ['closed', 'Closed'], ['all', 'All']]

  const accept = async (a) => {
    if (!(await confirm({ title: `Accept ${a.tenant.name}?`, message: `${a.listing.title} will be reserved for them and they will have time to confirm. Other applicants stay waiting until then.`, confirmLabel: 'Yes, accept', cancelLabel: 'Not yet', tone: 'info' }))) return
    run(() => api(`/landlord/applications/${a.id}/accept/`, { method: 'POST' }), `${a.tenant.name} was accepted and has been told on every channel.`)
  }
  const reject = async (a) => {
    if (!(await confirm({ title: `Reject ${a.tenant.name}?`, message: 'They will be told their application was not successful. This cannot be undone.', confirmLabel: 'Yes, reject', cancelLabel: 'Keep it', tone: 'danger' }))) return
    run(() => api(`/landlord/applications/${a.id}/reject/`, { method: 'POST', body: {} }), 'Application rejected. The tenant has been told.')
  }

  return (
    <div className="stack">
      <Alert error={error} />
      <div className="tabs">
        {tabs.map(([k, l]) => { const c = list.filter((a) => inGroup(a, k)).length; return <button key={k} className={group === k ? 'on' : ''} onClick={() => setGroup(k)}>{l}{c > 0 && <span className="cnt">{c}</span>}</button> })}
      </div>
      {data && shown.length === 0 && (
        <EmptyState icon="user" title={group === 'closed' ? 'Nothing closed yet' : 'No applications here'}>
          {group === 'action' ? 'New applications that need your decision will appear here.' : 'Applications that match this view will appear here.'}
        </EmptyState>
      )}
      {shown.map((a) => {
        const early = a.listing.available_from && a.desired_move_in && a.desired_move_in < a.listing.available_from
        return (
          <div className={`acard ${a.status === 'withdrawn' ? 'is-withdrawn' : ''}`} key={a.id}>
            <Avatar name={a.tenant.name} />
            <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
              <div className="row between wrap">
                <div>
                  <strong>{a.tenant.name}</strong> {a.tenant.verified && <span className="badge ok">Verified</span>}
                  <div className="muted small">Applied {timeAgo(a.created_at)} for <Link to={`/listings/${a.listing.id}`}>{a.listing.title}</Link> · {money(a.listing.rent, a.listing.currency)}</div>
                </div>
                <Badge status={a.status} />
              </div>
              <div className="meta">
                {a.desired_move_in && <span className={early ? 'datewarn' : ''}><Icon name="calendar" size={14} /> Wants to move in {fmtDay(a.desired_move_in)}{early ? ' (before the home is available)' : ''}</span>}
                {a.household_size && <span><Icon name="user" size={14} /> {a.household_size} {a.household_size === 1 ? 'person' : 'people'}</span>}
              </div>
              {a.tenant.checks?.length > 0 && <div className="chips">{a.tenant.checks.map((c) => <span key={c} className="badge ok">✓ {c}</span>)}</div>}
              {a.message && <p className="prewrap muted" style={{ margin: 0 }}>{a.message}</p>}
              {GROUPS.action.includes(a.status) && (
                <div className="lactions">
                  <button className="btn sm" disabled={busy} onClick={() => accept(a)}><Icon name="check" size={14} /> Accept</button>
                  <button className="btn danger sm" disabled={busy} onClick={() => reject(a)}><Icon name="x" size={14} /> Reject</button>
                </div>
              )}
              {a.status === 'accepted' && <p className="muted small" style={{ margin: 0 }}>Waiting for the tenant to confirm by {when(a.respond_by)}.</p>}
              {a.status === 'confirmed' && <p className="muted small" style={{ margin: 0 }}>Confirmed. Open <strong>Deals &amp; fees</strong> to pay your share.</p>}
              {a.status === 'withdrawn' && <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>The tenant withdrew this application.</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Listings({ state, reload }) {
  const { data, error } = state
  const confirm = useConfirm()
  const { busy, run } = useDo(reload)
  const archive = async (l) => {
    if (!(await confirm({ title: 'Archive this listing?', message: 'It will disappear from search. You can create a new listing later.', confirmLabel: 'Archive', tone: 'danger' }))) return
    run(() => api(`/landlord/listings/${l.id}/archive/`, { method: 'POST' }), 'Listing archived.')
  }
  return (
    <div className="stack">
      <Alert error={error} />
      {data?.length === 0 && <EmptyState icon="home" title="No listings yet">Add your first home to start receiving applications. <Link to="/landlord/new">Add a listing</Link></EmptyState>}
      {data?.map((l) => {
        const editable = ['draft', 'rejected'].includes(l.status)
        return (
          <div className="lcard" key={l.id}>
            <div className="lthumb">{l.images[0] ? <img src={l.images[0]} alt="" /> : <Icon name="image" size={30} />}</div>
            <div className="lbody">
              <div className="row between wrap"><h3>{l.title}</h3><Badge status={l.status} /></div>
              <div className="meta">
                <span><Icon name="pin" size={14} /> {[l.location.name, l.location.city].filter(Boolean).join(', ')}</span>
                <span><Icon name="dollar" size={14} /> {money(l.rent, l.currency)} / month</span>
                <span><Icon name="bed" size={14} /> {l.bedrooms} bed</span>
                <span><Icon name="camera" size={14} /> {l.images.length}/3 photos</span>
                <span><Icon name="user" size={14} /> {l.application_count} application{l.application_count === 1 ? '' : 's'}</span>
              </div>
              {l.rejection_reason && <div className="alert bad" style={{ margin: 0 }}><strong>Needs changes:</strong> {l.rejection_reason}</div>}
              <div className="lactions">
                {editable && <Link className="btn ghost sm" to={`/landlord/edit/${l.id}`}><Icon name="edit" size={14} /> Edit</Link>}
                {editable && <button className="btn sm" disabled={busy || l.images.length === 0} title={l.images.length === 0 ? 'Add a photo first' : ''} onClick={() => run(() => api(`/landlord/listings/${l.id}/submit/`, { method: 'POST' }), 'Submitted for review. You will get an alert when it is approved.')}>Submit for review</button>}
                {l.status === 'published' && <Link className="btn ghost sm" to={`/listings/${l.id}`}>View public page</Link>}
                {!['reserved', 'let', 'archived'].includes(l.status) && <button className="btn danger sm" disabled={busy} onClick={() => archive(l)}><Icon name="trash" size={14} /> Archive</button>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Questions({ state, reload }) {
  const { data, error } = state
  const { busy, run } = useDo(reload)
  const [replies, setReplies] = useState({})
  return (
    <div className="stack">
      <Alert error={error} />
      {data?.length === 0 && <EmptyState icon="message" title="No questions yet">Questions from tenants about your homes will appear here.</EmptyState>}
      {data?.map((e) => (
        <div className="acard" key={e.id}>
          <Avatar name={e.tenant_name} />
          <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
            <div><strong>{e.tenant_name}</strong> <span className="muted small">asked about {e.listing_title} · {timeAgo(e.created_at)}</span></div>
            <p className="prewrap" style={{ margin: 0 }}>{e.message}</p>
            {e.reply ? <div className="note" style={{ margin: 0 }}><strong>Your reply:</strong> {e.reply}</div> : (
              <div className="row gap wrap">
                <input style={{ flex: 1, minWidth: 220 }} value={replies[e.id] || ''} maxLength={500} placeholder="Write a reply" onChange={(ev) => setReplies({ ...replies, [e.id]: ev.target.value })} />
                <button className="btn sm" disabled={busy || !(replies[e.id] || '').trim()} onClick={() => run(() => api(`/landlord/enquiries/${e.id}/reply/`, { method: 'POST', body: { reply: replies[e.id] } }), 'Reply sent. The tenant has been told.')}>Send reply</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function Viewings({ state, reload }) {
  const { data, error } = state
  const { busy, run } = useDo(reload)
  const [openId, setOpenId] = useState(null)
  const [message, setMessage] = useState('')
  const set = (id, status, ok, msg = '') => run(async () => { await api(`/landlord/viewings/${id}/update/`, { method: 'POST', body: { status, message: msg } }); setOpenId(null); setMessage('') }, ok)
  return (
    <div className="stack">
      <Alert error={error} />
      {data?.length === 0 && <EmptyState icon="calendar" title="No viewing requests">When a tenant suggests a time to see a home, it appears here.</EmptyState>}
      {data?.map((v) => (
        <div className="acard" key={v.id}>
          <Avatar name={v.tenant_name} />
          <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
            <div className="row between wrap">
              <div><strong>{v.tenant_name}</strong> <span className="muted small">wants to view {v.listing_title}</span>
                <div className="meta"><span><Icon name="calendar" size={14} /> {when(v.proposed_at)}</span>{v.note && <span><Icon name="message" size={14} /> {v.note}</span>}</div></div>
              <Badge status={v.status} />
            </div>
            {v.status === 'requested' && openId !== v.id && (
              <div className="lactions">
                <button className="btn sm" onClick={() => { setOpenId(v.id); setMessage('') }}>Confirm viewing</button>
                <button className="btn danger sm" disabled={busy} onClick={() => set(v.id, 'cancelled', 'Viewing declined. The tenant has been told.')}>Decline</button>
              </div>
            )}
            {openId === v.id && (
              <div className="inline-form">
                <label className="field"><span>Where should they meet you? (optional)</span><input value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Meet at the main gate on Samora Machel Avenue" /><small className="muted">This message is sent to the tenant with the confirmation. Share only what you are comfortable with.</small></label>
                <div className="row gap wrap"><button className="btn sm" disabled={busy} onClick={() => set(v.id, 'confirmed', 'Viewing confirmed. The tenant has been told.', message)}>Confirm and send</button><button className="btn ghost sm" onClick={() => setOpenId(null)}>Cancel</button></div>
              </div>
            )}
            {v.status === 'confirmed' && <div className="lactions"><button className="btn ghost sm" disabled={busy} onClick={() => set(v.id, 'completed', 'Marked as done.')}>Mark as done</button></div>}
          </div>
        </div>
      ))}
    </div>
  )
}
