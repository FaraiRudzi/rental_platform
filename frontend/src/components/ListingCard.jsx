'use client'
import { useState } from 'react'
import { money } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import Icon from './Icons'
import Link from './Link'

const FURN = { furnished: 'Furnished', semi_furnished: 'Semi-furnished', unfurnished: 'Unfurnished' }
const pretty = (s) => (s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

// One home. view = 'grid' (card) or 'list' (wide row). Shows up to three photos you can flip through.
export default function ListingCard({ l, view = 'grid', saved = false, onSave }) {
  const [i, setI] = useState(0)
  const imgs = l.images || []
  const isNew = l.published_at && Date.now() - new Date(l.published_at).getTime() < 7 * 86400000
  const place = [l.location?.name, l.location?.city].filter(Boolean).join(', ')
  const flip = (d) => (e) => { e.preventDefault(); e.stopPropagation(); setI((i + d + imgs.length) % imgs.length) }
  const href = `/listings/${l.id}`

  return (
    <article className={`pcard ${view}`}>
      <div className="pcard-media">
        <Link to={href} aria-label={`View ${l.title}`}>
          {imgs[i] ? <img src={imgs[i]} alt="" loading="lazy" /> : <div className="noimg"><Icon name="image" size={34} /></div>}
        </Link>
        <div className="pbadges">
          {isNew && <span className="pbadge new">New</span>}
          {l.landlord?.verified && <span className="pbadge ver"><Icon name="shield" size={12} /> Verified</span>}
        </div>
        {imgs.length > 1 && (
          <>
            <button className="car prev" aria-label="Previous photo" onClick={flip(-1)}><Icon name="left" size={16} /></button>
            <button className="car next" aria-label="Next photo" onClick={flip(1)}><Icon name="right" size={16} /></button>
          </>
        )}
        {imgs.length > 0 && <span className="pcount"><Icon name="camera" size={12} /> {i + 1}/{imgs.length}</span>}
        <button className={`heart ${saved ? 'on' : ''}`} aria-label={saved ? 'Remove from saved homes' : 'Save this home'} aria-pressed={saved}
          onClick={(e) => { e.preventDefault(); onSave?.(l) }}><Icon name="heart" size={17} filled={saved} /></button>
      </div>
      <div className="pcard-body">
        <div className="pcard-price">{money(l.rent, l.currency)} <small>/ month</small></div>
        <h3 className="pcard-title"><Link to={href}>{l.title}</Link></h3>
        <div className="pcard-loc"><Icon name="pin" size={15} /> {place || 'Location not set'}</div>
        <div className="pfacts">
          <span><Icon name="bed" size={16} /> {l.bedrooms} bed{l.bedrooms === 1 ? '' : 's'}</span>
          <span><Icon name="bath" size={16} /> {l.bathrooms} bath{l.bathrooms === 1 ? '' : 's'}</span>
          <span><Icon name="sofa" size={16} /> {FURN[l.furnishing] || pretty(l.furnishing)}</span>
          <span><Icon name="building" size={16} /> {pretty(l.property_type)}</span>
        </div>
        {l.amenities?.length > 0 && <div className="chips">{l.amenities.slice(0, 3).map((a) => <span key={a.slug} className="chip">{a.name}</span>)}{l.amenities.length > 3 && <span className="chip">+{l.amenities.length - 3}</span>}</div>}
        <div className="pcard-foot">
          <span className="muted small">{l.published_at ? `Listed ${timeAgo(l.published_at)}` : ''}{l.distance_km != null && ` · ${l.distance_km} km`}</span>
          <Link className="btn sm" to={href}>View details</Link>
        </div>
      </div>
    </article>
  )
}
