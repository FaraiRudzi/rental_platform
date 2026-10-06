import { Link } from 'react-router-dom'
import { api, money, when } from '../api'
import { Alert, Badge, Empty } from '../components/ui'
import Placements from '../components/Placements'
import { useAction, useFetch } from '../hooks'

export default function MyDeals() {
  const apps = useFetch('/me/applications/')
  const act = useAction(apps.reload)
  const pending = (a) => ['submitted', 'under_review'].includes(a.status)

  return (
    <div className="stack">
      <h1>My applications</h1>
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
