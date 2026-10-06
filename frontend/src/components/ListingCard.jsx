import { Link } from 'react-router-dom'
import { money } from '../api'

export default function ListingCard({ l }) {
  return (
    <Link to={`/listings/${l.id}`} className="listing-card card h-100">
      <div className="thumb">{l.images?.[0] ? <img src={l.images[0]} alt="" loading="lazy" /> : <span className="muted">No photo</span>}</div>
      <div className="body">
        <div className="row between listing-price"><strong>{money(l.rent, l.currency)}</strong><span className="muted">/ month</span></div>
        <div className="title">{l.title}</div>
        <div className="muted small">{l.bedrooms} bed · {l.bathrooms} bath · {l.location.name}{l.distance_km != null && ` · ${l.distance_km} km`}</div>
        <div className="chips">
          {l.landlord.verified && <span className="badge ok">Verified landlord</span>}
          {l.amenities.slice(0, 3).map((a) => <span key={a.slug} className="chip">{a.name}</span>)}
        </div>
      </div>
    </Link>
  )
}
