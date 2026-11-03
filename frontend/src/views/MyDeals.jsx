'use client'
import { useState } from 'react'
import { useConfirm } from '@/components/ConfirmDialog'
import Icon from '@/components/Icons'
import Link from '@/components/Link'
import Placements from '@/components/Placements'
import { Alert, Badge, EmptyState, PageHeader, Stepper } from '@/components/ui'
import { api, money, when } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtDay, timeAgo } from '@/lib/format'
import { useFetch } from '@/lib/hooks'
import { toast } from '@/lib/toast'

const STEPS = ['Applied', 'Accepted', 'Confirmed', 'Paid', 'Move in']
const ACTIVE = ['submitted', 'under_review', 'accepted', 'confirmed']
const stepOf = (a) => {
  if (a.status === 'accepted') return 1
  if (a.status === 'confirmed') return a.placement_status === 'active' ? 4 : a.placement_status === 'paid' ? 3 : 2
  return 0
}

export default function MyDeals() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const { data, error, reload } = useFetch('/me/applications/')
  const [tab, setTab] = useState('active')
  const [busy, setBusy] = useState(false)
  const list = data || []
  const shown = list.filter((a) => (tab === 'active' ? ACTIVE.includes(a.status) : !ACTIVE.includes(a.status)))
  const nActive = list.filter((a) => ACTIVE.includes(a.status)).length

  const act = async (fn, ok) => {
    setBusy(true)
    try { await fn(); toast.success(ok); reload() } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const withdraw = async (a) => {
    const yes = await confirm({
      title: 'Withdraw your application?',
      message: `The landlord will be told, and "${a.listing.title}" may be taken by someone else. If it is still available you can apply again later, but you will lose your place in the queue.`,
      confirmLabel: 'Yes, withdraw', cancelLabel: 'Keep my application', tone: 'danger',
    })
    if (yes) act(() => api(`/applications/${a.id}/withdraw/`, { method: 'POST' }), `Your application for ${a.listing.title} was withdrawn. The landlord has been told.`)
  }
  const confirmOffer = async (a) => {
    const fee = a.fee_estimate ? ` Your share of the platform fee is ${money(a.fee_estimate.tenant_fee, a.fee_estimate.currency)}, and it is locked once you confirm.` : ''
    if (await confirm({ title: 'Confirm this home?', message: `You are taking ${a.listing.title}.${fee}`, confirmLabel: 'Yes, confirm', cancelLabel: 'Not yet', tone: 'info' })) {
      act(() => api(`/applications/${a.id}/confirm/`, { method: 'POST' }), 'Confirmed! Pay your share below to unlock the contact details.')
    }
  }
  const decline = async (a) => {
    if (await confirm({ title: 'Decline this offer?', message: 'The home will be offered to other people again. You can still apply later if it stays available.', confirmLabel: 'Yes, decline', cancelLabel: 'Keep the offer', tone: 'danger' })) {
      act(() => api(`/applications/${a.id}/decline/`, { method: 'POST', body: {} }), 'Offer declined. The home is open to others again.')
    }
  }

  return (
    <div className="stack">
      <PageHeader title="My applications" subtitle="Track every home you applied for, confirm offers and pay your share." />
      {user.verification_status !== 'verified' && <div className="note">Verified tenants are more likely to be accepted. <Link to="/verification"><strong>Verify your account</strong></Link>.</div>}
      <Alert error={error} />
      <div className="tabs">
        <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>Active{nActive > 0 && <span className="cnt">{nActive}</span>}</button>
        <button className={tab === 'closed' ? 'on' : ''} onClick={() => setTab('closed')}>Closed{list.length - nActive > 0 && <span className="cnt">{list.length - nActive}</span>}</button>
      </div>

      {data && shown.length === 0 && (
        <EmptyState icon="home" title={tab === 'active' ? 'No active applications' : 'Nothing closed yet'}>
          {tab === 'active' ? <>You have not applied for a home yet. <Link to="/">Find a home</Link></> : 'Withdrawn, rejected and expired applications appear here.'}
        </EmptyState>
      )}

      {shown.map((a) => (
        <div className="lcard" key={a.id} style={a.status === 'withdrawn' ? { background: 'color-mix(in srgb,var(--warn) 5%,white)' } : undefined}>
          <div className="lthumb">{a.listing.cover ? <img src={a.listing.cover} alt="" /> : <Icon name="image" size={30} />}</div>
          <div className="lbody">
            <div className="row between wrap">
              <h3><Link to={`/listings/${a.listing.id}`}>{a.listing.title}</Link></h3>
              <Badge status={a.status} />
            </div>
            <div className="meta">
              {a.listing.location && <span><Icon name="pin" size={14} /> {a.listing.location}</span>}
              <span><Icon name="dollar" size={14} /> {money(a.listing.rent, a.listing.currency)} / month</span>
              <span><Icon name="clock" size={14} /> Applied {timeAgo(a.created_at)}</span>
              {a.desired_move_in && <span><Icon name="calendar" size={14} /> Move in {fmtDay(a.desired_move_in)}</span>}
            </div>
            {ACTIVE.includes(a.status) && <Stepper steps={STEPS} current={stepOf(a)} />}
            {a.status === 'withdrawn' && <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>You withdrew this application. The landlord was told.</p>}
            {a.status === 'rejected' && <p className="muted small" style={{ margin: 0 }}>The landlord chose another applicant.</p>}
            {a.status === 'expired' && <p className="muted small" style={{ margin: 0 }}>The offer lapsed because it was not confirmed in time.</p>}

            {a.status === 'accepted' && (
              <div className="note" style={{ margin: '6px 0 0' }}>
                <strong>The landlord accepted you.</strong> Confirm before {when(a.respond_by)}.
                {a.fee_estimate && <div>Your share of the fee: <strong>{money(a.fee_estimate.tenant_fee, a.fee_estimate.currency)}</strong>. It is locked once you confirm.</div>}
              </div>
            )}
            <div className="lactions">
              {a.status === 'accepted' && (
                <>
                  <button className="btn sm" disabled={busy} onClick={() => confirmOffer(a)}><Icon name="check" size={14} /> Confirm and continue</button>
                  <button className="btn danger sm" disabled={busy} onClick={() => decline(a)}>Decline</button>
                </>
              )}
              {['submitted', 'under_review'].includes(a.status) && <button className="btn danger sm" disabled={busy} onClick={() => withdraw(a)}>Withdraw application</button>}
              {['withdrawn', 'declined', 'expired', 'rejected'].includes(a.status) && a.listing.status === 'published' && <Link className="btn ghost sm" to={`/listings/${a.listing.id}`}>View the home</Link>}
            </div>
          </div>
        </div>
      ))}

      <h2>Confirmed placements and payments</h2>
      <Placements role="tenant" />
    </div>
  )
}
