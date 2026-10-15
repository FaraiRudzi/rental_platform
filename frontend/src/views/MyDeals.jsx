'use client'

import Link from '@/components/Link'
import { api, money, when } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Alert, Badge, Empty, PageHeader } from '@/components/ui'
import Placements from '@/components/Placements'
import { useAction, useFetch } from '@/lib/hooks'

export default function MyDeals() {
  const { user } = useAuth()
  const apps = useFetch('/me/applications/')
  const act = useAction(apps.reload)
  const pending = (a) => ['submitted', 'under_review'].includes(a.status)

  return (
    <div className="stack">
      <PageHeader title="My applications" subtitle="Track every home you applied for, confirm offers and pay your share." />
      {user.verification_status !== 'verified' && <div className="note">Verified tenants are more likely to be accepted. <Link to="/verification"><strong>Verify your account</strong></Link>.</div>}
      <Alert error={apps.error || act.error} ok={act.ok} />
      {apps.data?.length === 0 && <Empty>You have not applied for any homes yet. <Link to="/">Find a home</Link></Empty>}
      {apps.data?.map((a) => (
        <div className="card" key={a.id}>
          <div className="row between">
            <h3><Link to={`/listings/${a.listing.id}`}>{a.listing.title}</Link></h3><Badge status={a.status} />
          </div>
          <p className="muted">{money(a.listing.rent, a.listing.currency)} / month · applied {when(a.created_at)}</p>
          {pending(a) && <button className="btn ghost" onClick={() => act.run(() => api(`/applications/${a.id}/withdraw/`, { method: 'POST' }), 'Withdrawn.')}>Withdraw</button>}
          {a.status === 'accepted' && (
            <div className="note">
              <strong>The landlord accepted you!</strong> Confirm before {when(a.respond_by)}.
              {a.fee_estimate && <div>Your share of the fee: <strong>{money(a.fee_estimate.tenant_fee, a.fee_estimate.currency)}</strong> (the landlord pays {money(a.fee_estimate.landlord_fee, a.fee_estimate.currency)}). The fee is locked once you confirm.</div>}
              <div className="row gap">
                <button className="btn" disabled={act.busy} onClick={() => act.run(() => api(`/applications/${a.id}/confirm/`, { method: 'POST' }).then(() => { apps.reload() }), 'Confirmed! Pay your share below to unlock contact details.')}>Confirm and continue</button>
                <button className="btn danger" disabled={act.busy} onClick={() => act.run(() => api(`/applications/${a.id}/decline/`, { method: 'POST', body: {} }), 'Declined.')}>Decline</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <h2>Confirmed placements and payments</h2>
      <Placements role="tenant" />
    </div>
  )
}
