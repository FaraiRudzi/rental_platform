import { Link } from 'react-router-dom'
import { money } from '../api'

export default function ListingCard({ l }) {
  return (
    <Link to={`/listings/${l.id}`} className="listing-card">
      <div className="thumb">
        {l.images?.[0] ? <img src={l.images[0]} alt="" loading="lazy" /> : <span className="muted">No photo</span>}
        <span className="price-tag">{money(l.rent, l.currency)}<small style={{ fontWeight: 500, opacity: 0.8 }}> / month</small></span>
      </div>
      <div className="body">
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
