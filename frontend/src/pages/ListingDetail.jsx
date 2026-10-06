import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, money } from '../api'
import { useAuth } from '../auth'
import { Alert, Badge, Field } from '../components/ui'
import { useAction, useFetch } from '../hooks'

export default function ListingDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: l, error, loading, reload } = useFetch(`/listings/${id}/`)
  const [img, setImg] = useState(0)
  const [message, setMessage] = useState('')
  const [moveIn, setMoveIn] = useState('')
  const [viewAt, setViewAt] = useState('')
  const apply = useAction(reload)
  const enquire = useAction()
  const view = useAction()
  const fav = useAction()

  if (loading) return <p className="muted">Loading…</p>
  if (error) return <Alert error={error} />
  const isTenant = user?.role === 'tenant'
  const open = l.status === 'published'

  return (
    <div className="detail">
      <div>
        <div className="gallery">
          {l.images.length ? <img className="hero" src={l.images[img]} alt={l.title} /> : <div className="hero placeholder">No photos</div>}
          <div className="thumbs">{l.images.map((src, i) => <img key={src} src={src} alt="" className={i === img ? 'on' : ''} onClick={() => setImg(i)} />)}</div>
        </div>
        <h1>{l.title}</h1>
        <p className="muted">{l.location.name}{l.location.city && `, ${l.location.city}`} · <Badge status={l.status} /></p>
        <div className="chips big">
          <span className="chip">{l.bedrooms} bedrooms</span><span className="chip">{l.bathrooms} bathrooms</span>
          <span className="chip">{l.furnishing.replace('_', ' ')}</span><span className="chip">{l.property_type.replace('_', ' ')}</span>
          {l.available_from && <span className="chip">Available {l.available_from}</span>}
        </div>
        {l.description && <p className="prewrap">{l.description}</p>}
        {l.amenities.length > 0 && <><h3>Amenities</h3><div className="chips">{l.amenities.map((a) => <span key={a.slug} className="chip">{a.name}</span>)}</div></>}
        <p className="muted small">The exact address and landlord phone number are shared once the placement is confirmed and fees are paid.</p>
      </div>

      <aside className="card sticky">
        <div className="price">{money(l.rent, l.currency)} <small>/ month</small></div>
        {l.deposit && <p className="muted">Deposit {money(l.deposit, l.currency)}</p>}
        <p>Landlord: {l.landlord.name} {l.landlord.verified && <span className="badge ok">Verified</span>}</p>
        {l.fee_estimate && isTenant && (
          <div className="note">If your application is accepted and you confirm, your share of the platform fee is <strong>{money(l.fee_estimate.tenant_fee, l.fee_estimate.currency)}</strong>. The fee is only due after both sides confirm.</div>
        )}

        {!user && <Link className="btn" to="/login">Log in to apply</Link>}
        {user && !isTenant && <p className="muted">Log in with a tenant account to apply.</p>}
        {isTenant && open && (
          <>
            {l.my_application ? (
              <p>Your application: <Badge status={l.my_application.status} /> <Link to="/deals">View</Link></p>
            ) : (
              <div className="stack">
                <Field label="Message to the landlord"><textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell the landlord about yourself and your household." /></Field>
                <Field label="Preferred move-in date"><input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} /></Field>
                <button className="btn" disabled={apply.busy} onClick={() => apply.run(() => api(`/listings/${id}/apply/`, { method: 'POST', body: { message, desired_move_in: moveIn || null } }), 'Application sent!')}>Apply for this home</button>
                <Alert error={apply.error} ok={apply.ok} />
              </div>
            )}
            <hr />
            <div className="stack">
              <Field label="Ask a question"><textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
              <button className="btn ghost" disabled={enquire.busy || !message.trim()} onClick={() => enquire.run(() => api(`/listings/${id}/enquiries/`, { method: 'POST', body: { message } }), 'Question sent.')}>Send enquiry</button>
              <Alert error={enquire.error} ok={enquire.ok} />
              <Field label="Request a viewing"><input type="datetime-local" value={viewAt} onChange={(e) => setViewAt(e.target.value)} /></Field>
              <button className="btn ghost" disabled={view.busy || !viewAt} onClick={() => view.run(() => api(`/listings/${id}/viewings/`, { method: 'POST', body: { proposed_at: new Date(viewAt).toISOString() } }), 'Viewing requested.')}>Request viewing</button>
              <Alert error={view.error} ok={view.ok} />
              <button className="link" onClick={() => fav.run(() => api(`/listings/${id}/favourite/`, { method: 'POST' }), 'Saved to favourites.')}>♡ Save to favourites</button>
              <Alert error={fav.error} ok={fav.ok} />
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
