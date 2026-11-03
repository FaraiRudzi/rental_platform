'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useConfirm } from '@/components/ConfirmDialog'
import Icon from '@/components/Icons'
import IconInput from '@/components/IconInput'
import Link from '@/components/Link'
import { Alert, Field, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { addDays, fmtDay, isoDay } from '@/lib/format'
import { useFetch } from '@/lib/hooks'
import { useNavigate } from '@/lib/nav-hooks'
import { toast } from '@/lib/toast'

const MAX_PHOTOS = 3
const MAX_BYTES = 8 * 1024 * 1024
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const REQUIRED = ['title', 'city', 'suburb', 'address_line', 'rent']
const blank = { title: '', city: '', suburb: '', address_line: '', property_type: 'house', furnishing: 'unfurnished', rent: '', currency: 'USD', deposit: '', bedrooms: '1', bathrooms: '1', available_from: '', description: '', amenities: [] }

const whole = (v) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 30
function validate(f, today, yearAhead) {
  return {
    title: !f.title ? '' : f.title.trim().length < 8 ? 'Make the title at least 8 characters, for example "2 bedroom flat in Avondale".' : f.title.length > 160 ? 'Keep the title under 160 characters.' : '',
    city: !f.city ? '' : f.city.trim().length < 2 || !/[A-Za-z]/.test(f.city) ? 'Enter the town or city, for example Harare.' : '',
    suburb: !f.suburb ? '' : f.suburb.trim().length < 2 || !/[A-Za-z]/.test(f.suburb) ? 'Enter the suburb or area, for example Avondale.' : '',
    address_line: !f.address_line ? '' : f.address_line.trim().length < 5 ? 'Enter the full street address, for example 12 Samora Machel Avenue.' : '',
    rent: f.rent === '' ? '' : !(Number(f.rent) > 0) ? 'Enter a monthly rent above zero.' : Number(f.rent) > 1000000 ? 'That rent looks too high. Please check it.' : '',
    deposit: f.deposit === '' ? '' : Number(f.deposit) < 0 ? 'The deposit cannot be negative.' : '',
    bedrooms: f.bedrooms === '' ? 'Enter the number of bedrooms (0 for a room).' : !whole(f.bedrooms) ? 'Enter a whole number from 0 to 30.' : '',
    bathrooms: f.bathrooms === '' ? 'Enter the number of bathrooms.' : !whole(f.bathrooms) ? 'Enter a whole number from 0 to 30.' : '',
    available_from: !f.available_from ? '' : f.available_from < today ? 'This date is in the past. Leave it empty if the home is available now.' : f.available_from > yearAhead ? 'That is more than a year away.' : '',
    description: f.description.length > 3000 ? 'Keep the description under 3000 characters.' : '',
  }
}

export default function ListingForm() {
  const { id: routeId } = useParams()
  const nav = useNavigate()
  const confirm = useConfirm()
  const fileInput = useRef(null)
  const cities = useFetch('/locations/', { type: 'city' })
  const suburbs = useFetch('/locations/', { type: 'suburb' })
  const amenities = useFetch('/amenities/')
  const [f, setF] = useState(blank)
  const [touched, setTouched] = useState({})
  const [savedId, setSavedId] = useState(routeId || null)
  const [status, setStatus] = useState('draft')
  const [rejection, setRejection] = useState('')
  const [photos, setPhotos] = useState([]) // already saved: { id, url }
  const [files, setFiles] = useState([]) // chosen now: { file, url }
  const [busy, setBusy] = useState('')
  const [formError, setFormError] = useState('')
  const [loadError, setLoadError] = useState('')

  const today = isoDay(new Date())
  const yearAhead = isoDay(addDays(new Date(), 365))
  const errs = useMemo(() => validate(f, today, yearAhead), [f, today, yearAhead])
  const locked = !['draft', 'rejected'].includes(status)
  const total = photos.length + files.length

  useEffect(() => {
    if (!routeId) return
    api(`/landlord/listings/${routeId}/`).then((l) => {
      setStatus(l.status); setRejection(l.rejection_reason || '')
      setPhotos(l.photos || [])
      setF({
        title: l.title, city: l.location.city || '', suburb: l.location.name, address_line: l.address_line || '', property_type: l.property_type,
        furnishing: l.furnishing, rent: String(l.rent), currency: l.currency, deposit: l.deposit ? String(l.deposit) : '', bedrooms: String(l.bedrooms),
        bathrooms: String(l.bathrooms), available_from: l.available_from || '', description: l.description || '', amenities: l.amenities.map((a) => a.slug),
      })
    }).catch((e) => setLoadError(e.message))
  }, [routeId])
  useEffect(() => () => files.forEach((x) => URL.revokeObjectURL(x.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const cityNames = useMemo(() => [...new Set((cities.data || []).map((c) => c.name))].sort(), [cities.data])
  const suburbNames = useMemo(() => {
    const all = suburbs.data || []
    const inCity = f.city ? all.filter((s) => (s.parent_name || '').toLowerCase() === f.city.trim().toLowerCase()) : all
    return [...new Set((inCity.length ? inCity : all).map((s) => s.name))].sort()
  }, [suburbs.data, f.city])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }))
  const fe = (k) => {
    if (errs[k] && (touched[k] || String(f[k]).length > 0)) return errs[k]
    if (touched[k] && REQUIRED.includes(k) && !String(f[k]).trim()) return 'This field is required.'
    return ''
  }
  const toggleAmenity = (slug) => setF({ ...f, amenities: f.amenities.includes(slug) ? f.amenities.filter((s) => s !== slug) : [...f.amenities, slug] })

  const addFiles = (list) => {
    const chosen = [...list]
    const room = MAX_PHOTOS - total
    const good = []
    let skipped = 0
    chosen.forEach((file) => {
      if (!OK_TYPES.includes(file.type)) { toast.error(`${file.name}: use a JPG, PNG or WebP photo.`); return }
      if (file.size > MAX_BYTES) { toast.error(`${file.name} is larger than 8 MB.`); return }
      if (good.length >= room) { skipped += 1; return }
      good.push({ file, url: URL.createObjectURL(file) })
    })
    if (skipped) toast.error(`A listing can have ${MAX_PHOTOS} photos at most. ${skipped} ${skipped === 1 ? 'photo was' : 'photos were'} not added.`)
    if (good.length) setFiles((prev) => [...prev, ...good])
  }
  const removeNew = (i) => { URL.revokeObjectURL(files[i].url); setFiles(files.filter((_, n) => n !== i)) }
  const removeSaved = async (p) => {
    if (!(await confirm({ title: 'Remove this photo?', message: 'The photo will be deleted from this listing.', confirmLabel: 'Remove photo', tone: 'danger' }))) return
    try { await api(`/landlord/listings/${savedId}/images/${p.id}/`, { method: 'DELETE' }); setPhotos(photos.filter((x) => x.id !== p.id)); toast.success('Photo removed.') } catch (e) { toast.error(e.message) }
  }

  const save = async (submitAfter) => {
    setTouched(Object.fromEntries(Object.keys(f).map((k) => [k, true])))
    setFormError('')
    const missing = REQUIRED.filter((k) => !String(f[k]).trim())
    if (missing.length || Object.values(errs).some(Boolean)) { setFormError('Please fix the highlighted fields.'); toast.error('Please fix the highlighted fields.'); return }
    if (submitAfter && total < 1) { setFormError('Add at least one photo before submitting for review.'); toast.error('Add at least one photo before submitting.'); return }
    setBusy(submitAfter ? 'submit' : 'save')
    try {
      const body = {
        title: f.title.trim(), city: f.city.trim(), suburb: f.suburb.trim(), address_line: f.address_line.trim(), property_type: f.property_type, furnishing: f.furnishing,
        rent: f.rent, currency: f.currency.toUpperCase(), deposit: f.deposit === '' ? null : f.deposit, bedrooms: Number(f.bedrooms), bathrooms: Number(f.bathrooms),
        available_from: f.available_from || null, description: f.description.trim(), amenities: f.amenities,
      }
      const saved = await api(savedId ? `/landlord/listings/${savedId}/` : '/landlord/listings/', { method: savedId ? 'PATCH' : 'POST', body })
      setSavedId(saved.id)
      if (files.length) {
        const fd = new FormData()
        files.forEach((x) => fd.append('images', x.file))
        const up = await api(`/landlord/listings/${saved.id}/images/`, { method: 'POST', form: fd })
        up.warnings?.forEach((w) => toast.info(w))
      }
      if (submitAfter) await api(`/landlord/listings/${saved.id}/submit/`, { method: 'POST' })
      toast.success(submitAfter ? 'Submitted for review. You will get an alert when it is approved.' : 'Draft saved.')
      nav('/landlord?tab=listings')
    } catch (e) { setFormError(e.message); toast.error(e.message) } finally { setBusy('') }
  }

  if (loadError) return <Alert error={loadError} />
  const slots = Array.from({ length: MAX_PHOTOS - total }, (_, i) => i)

  return (
    <div className="formwrap">
      <PageHeader title={routeId ? 'Edit listing' : 'Add a listing'} subtitle="Fill in the details tenants look for. Fields marked * are required.">
        <Link to="/landlord?tab=listings" className="btn ghost sm"><Icon name="arrowLeft" size={15} /> Back to my listings</Link>
      </PageHeader>
      {rejection && <div className="alert bad" role="alert"><strong>Needs changes:</strong> {rejection}</div>}
      {locked && <div className="alert bad" role="alert">This listing is <strong>{status.replace('_', ' ')}</strong>, so it can no longer be edited.</div>}
      {formError && <div className="alert bad" role="alert">{formError}</div>}

      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }} className="formwrap">
        <section className="card fsec">
          <h3><Icon name="home" /> The basics</h3>
          <Field label="Listing title *" error={fe('title')} hint="A clear headline, for example: 2 bedroom flat with borehole in Avondale.">
            <input value={f.title} onChange={set('title')} onBlur={blur('title')} maxLength={160} placeholder="2 bedroom flat with borehole in Avondale" />
          </Field>
          <div className="two">
            <Field label="Property type"><select value={f.property_type} onChange={set('property_type')}>{['house', 'flat', 'cottage', 'single_room', 'shared_room', 'backroom', 'other'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></Field>
            <Field label="Furnishing"><select value={f.furnishing} onChange={set('furnishing')}><option value="unfurnished">Unfurnished</option><option value="semi_furnished">Semi-furnished</option><option value="furnished">Furnished</option></select></Field>
          </div>
        </section>

        <section className="card fsec">
          <h3><Icon name="pin" /> Where is it?</h3>
          <div className="two">
            <Field label="Town / City *" error={fe('city')} hint="Start typing, or pick from the list.">
              <IconInput icon="building" list="city-dl" value={f.city} onChange={set('city')} onBlur={blur('city')} placeholder="e.g. Harare" maxLength={80} autoComplete="off" />
            </Field>
            <Field label="Location (suburb or area) *" error={fe('suburb')} hint="The neighbourhood tenants search by.">
              <IconInput icon="pin" list="suburb-dl" value={f.suburb} onChange={set('suburb')} onBlur={blur('suburb')} placeholder="e.g. Avondale" maxLength={80} autoComplete="off" />
            </Field>
          </div>
          <datalist id="city-dl">{cityNames.map((n) => <option key={n} value={n} />)}</datalist>
          <datalist id="suburb-dl">{suburbNames.map((n) => <option key={n} value={n} />)}</datalist>
          <Field label="Street address *" error={fe('address_line')} hint="Kept private. It is only shared with the tenant after the placement is confirmed and fees are paid.">
            <IconInput icon="home" value={f.address_line} onChange={set('address_line')} onBlur={blur('address_line')} placeholder="e.g. 12 Samora Machel Avenue" maxLength={255} />
          </Field>
        </section>

        <section className="card fsec">
          <h3><Icon name="dollar" /> Price and size</h3>
          <div className="two">
            <Field label="Monthly rent *" error={fe('rent')}>
              <div className="money-input"><input className="cur" list="cur-dl" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase().slice(0, 3) })} aria-label="Currency" style={{ maxWidth: 76, borderRadius: '10px 0 0 10px', textAlign: 'center' }} />
                <input type="number" inputMode="decimal" min="1" step="0.01" value={f.rent} onChange={set('rent')} onBlur={blur('rent')} placeholder="200" style={{ borderRadius: '0 10px 10px 0' }} /></div>
            </Field>
            <Field label="Deposit (optional)" error={fe('deposit')}><input type="number" inputMode="decimal" min="0" step="0.01" value={f.deposit} onChange={set('deposit')} onBlur={blur('deposit')} placeholder="e.g. 200" /></Field>
          </div>
          <datalist id="cur-dl"><option value="USD" /><option value="ZWG" /><option value="ZAR" /></datalist>
          <div className="two">
            <Field label="Bedrooms *" error={fe('bedrooms')}><input type="number" min="0" max="30" step="1" value={f.bedrooms} onChange={set('bedrooms')} onBlur={blur('bedrooms')} /></Field>
            <Field label="Bathrooms *" error={fe('bathrooms')}><input type="number" min="0" max="30" step="1" value={f.bathrooms} onChange={set('bathrooms')} onBlur={blur('bathrooms')} /></Field>
          </div>
          <Field label="Available from (optional)" error={fe('available_from')} hint={f.available_from && !errs.available_from ? `Tenants can only choose a move-in date from ${fmtDay(f.available_from)}.` : 'Leave empty if the home is available now.'}>
            <input type="date" min={today} max={yearAhead} value={f.available_from} onChange={set('available_from')} onBlur={blur('available_from')} />
          </Field>
        </section>

        <section className="card fsec">
          <h3><Icon name="list" /> Description and features</h3>
          <Field label="Description" error={fe('description')}><textarea rows={5} maxLength={3000} value={f.description} onChange={set('description')} onBlur={blur('description')} placeholder="Describe the rooms, the neighbourhood, transport, water and power..." /></Field>
          <div className={`counter ${f.description.length >= 3000 ? 'over' : ''}`}>{f.description.length}/3000</div>
          <fieldset><legend>Features</legend>
            <div className="checks">{amenities.data?.map((a) => <label key={a.slug}><input type="checkbox" checked={f.amenities.includes(a.slug)} onChange={() => toggleAmenity(a.slug)} /> {a.name}</label>)}</div>
          </fieldset>
        </section>

        <section className="card fsec">
          <h3><Icon name="camera" /> Photos <span className="muted small" style={{ fontWeight: 500 }}>({total} of {MAX_PHOTOS})</span></h3>
          <p className="muted small" style={{ margin: 0 }}>Up to {MAX_PHOTOS} photos. The first is the cover. JPG, PNG or WebP, up to 8 MB each. Use your own photos of this home.</p>
          <div className="photos">
            {photos.map((p, i) => (
              <div className="photo" key={p.id}><img src={p.url} alt={`Photo ${i + 1}`} />{i === 0 && <span className="cover">Cover</span>}
                <button type="button" className="btn xs danger-solid rm" onClick={() => removeSaved(p)} aria-label="Remove photo"><Icon name="x" size={13} /></button></div>
            ))}
            {files.map((x, i) => (
              <div className="photo" key={x.url}><img src={x.url} alt={`New photo ${i + 1}`} />{photos.length + i === 0 && <span className="cover">Cover</span>}
                <button type="button" className="btn xs danger-solid rm" onClick={() => removeNew(i)} aria-label="Remove photo"><Icon name="x" size={13} /></button></div>
            ))}
            {slots.map((s) => (
              <button type="button" key={`slot${s}`} className="dz" onClick={() => fileInput.current.click()}>
                <span><Icon name="upload" size={22} /><br />Add photo</span>
              </button>
            ))}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        </section>
      </fieldset>

      <div className="sticky-actions">
        <Link to="/landlord?tab=listings" className="btn ghost sm">Cancel</Link>
        <button className="btn ghost sm" disabled={!!busy || locked} onClick={() => save(false)}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
        <button className="btn sm" disabled={!!busy || locked} onClick={() => save(true)}>{busy === 'submit' ? 'Submitting…' : 'Save and submit for review'}</button>
      </div>
    </div>
  )
}
