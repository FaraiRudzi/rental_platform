'use client'

import { useEffect, useState } from 'react'
import { useNavigate } from '@/lib/nav-hooks'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Alert, Field } from '@/components/ui'
import { useFetch } from '@/lib/hooks'

const blank = { location: '', address_line: '', property_type: 'house', title: '', description: '', rent: '', currency: 'USD', deposit: '', bedrooms: 1, bathrooms: 1, furnishing: 'unfurnished', available_from: '', amenities: [] }

export default function ListingForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const suburbs = useFetch('/locations/', { type: 'suburb' })
  const amenities = useFetch('/amenities/')
  const [f, setF] = useState(blank)
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api(`/landlord/listings/${id}/`).then((l) => setF({
      ...blank, location: l.location.id, address_line: l.address_line, property_type: l.property_type, title: l.title,
      description: l.description || '', rent: l.rent, currency: l.currency, deposit: l.deposit || '', bedrooms: l.bedrooms,
      bathrooms: l.bathrooms, furnishing: l.furnishing, available_from: l.available_from || '', amenities: l.amenities.map((a) => a.slug),
    })).catch((e) => setError(e.message))
  }, [id])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const toggle = (slug) => setF({ ...f, amenities: f.amenities.includes(slug) ? f.amenities.filter((s) => s !== slug) : [...f.amenities, slug] })

  const save = async (submitAfter) => {
    setBusy(true); setError(''); setWarnings([])
    try {
      const body = { ...f, location: Number(f.location), rent: f.rent, deposit: f.deposit || null, available_from: f.available_from || null }
      const saved = await api(id ? `/landlord/listings/${id}/` : '/landlord/listings/', { method: id ? 'PATCH' : 'POST', body })
      if (files.length) {
        const form = new FormData()
        files.forEach((file) => form.append('images', file))
        const up = await api(`/landlord/listings/${saved.id}/images/`, { method: 'POST', form })
        if (up.warnings?.length) setWarnings(up.warnings)
      }
      if (submitAfter) await api(`/landlord/listings/${saved.id}/submit/`, { method: 'POST' })
      nav('/landlord')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card narrow wide">
      <h1>{id ? 'Edit listing' : 'Add a listing'}</h1>
      <Alert error={error} />
      {warnings.map((w) => <div key={w} className="alert bad">{w}</div>)}
      <div className="stack">
        <Field label="Title"><input value={f.title} onChange={set('title')} placeholder="2 bedroom flat with borehole" /></Field>
        <Field label="Area">
          <select value={f.location} onChange={set('location')}><option value="">Choose…</option>{suburbs.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Field>
        <Field label="Street address" hint="Private. Shown only after the placement is paid."><input value={f.address_line} onChange={set('address_line')} /></Field>
        <div className="row gap">
          <Field label="Property type"><select value={f.property_type} onChange={set('property_type')}>{['house', 'flat', 'cottage', 'single_room', 'shared_room', 'backroom', 'other'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></Field>
          <Field label="Furnishing"><select value={f.furnishing} onChange={set('furnishing')}><option value="unfurnished">Unfurnished</option><option value="semi_furnished">Semi-furnished</option><option value="furnished">Furnished</option></select></Field>
        </div>
        <div className="row gap">
          <Field label="Monthly rent"><input type="number" min="1" value={f.rent} onChange={set('rent')} /></Field>
          <Field label="Currency"><input value={f.currency} onChange={set('currency')} maxLength={3} /></Field>
          <Field label="Deposit"><input type="number" min="0" value={f.deposit} onChange={set('deposit')} /></Field>
        </div>
        <div className="row gap">
          <Field label="Bedrooms"><input type="number" min="0" value={f.bedrooms} onChange={set('bedrooms')} /></Field>
          <Field label="Bathrooms"><input type="number" min="0" value={f.bathrooms} onChange={set('bathrooms')} /></Field>
          <Field label="Available from"><input type="date" value={f.available_from} onChange={set('available_from')} /></Field>
        </div>
        <Field label="Description"><textarea rows={4} value={f.description} onChange={set('description')} /></Field>
        <fieldset><legend>Amenities</legend><div className="checks">{amenities.data?.map((a) => <label key={a.slug}><input type="checkbox" checked={f.amenities.includes(a.slug)} onChange={() => toggle(a.slug)} /> {a.name}</label>)}</div></fieldset>
        <Field label="Photos" hint="Up to 12. They are resized automatically. Use your own photos of this home."><input type="file" accept="image/*" multiple onChange={(e) => setFiles([...e.target.files])} /></Field>
        <div className="row gap">
          <button className="btn ghost" disabled={busy} onClick={() => save(false)}>Save draft</button>
          <button className="btn" disabled={busy} onClick={() => save(true)}>Save and submit for review</button>
        </div>
      </div>
    </div>
  )
}
