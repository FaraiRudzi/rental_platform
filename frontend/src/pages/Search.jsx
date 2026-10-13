import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import ListingCard from '../components/ListingCard'
import { Alert, Empty, Field } from '../components/ui'
import { useFetch } from '../hooks'

const TYPES = [['', 'Any type'], ['house', 'House'], ['flat', 'Flat'], ['cottage', 'Cottage'], ['single_room', 'Single room'], ['shared_room', 'Shared room'], ['backroom', 'Backroom']]
const FILTER_KEYS = ['location', 'min_rent', 'max_rent', 'bedrooms', 'type', 'furnishing', 'amenities', 'verified', 'sort', 'q']

export default function Search() {
  const { user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const [form, setForm] = useState(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) || ''])))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({})
  const suburbs = useFetch('/locations/', { type: 'suburb' })
  const amenities = useFetch('/amenities/')
  const page = Number(sp.get('page') || 1)
  const selected = useMemo(() => (form.amenities ? form.amenities.split(',') : []), [form.amenities])

  const query = useMemo(() => Object.fromEntries([...sp.entries()]), [sp])
  useEffect(() => {
    setLoading(true)
    api('/listings/', { params: query }).then(setData).catch((e) => setMsg({ error: e.message })).finally(() => setLoading(false))
  }, [query])

  const clear = () => { setForm(Object.fromEntries(FILTER_KEYS.map((k) => [k, '']))); setSp({}) }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value })
  const toggleAmenity = (slug) => {
    const next = selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]
    setForm({ ...form, amenities: next.join(',') })
  }
  const submit = (e) => { e?.preventDefault(); const p = {}; FILTER_KEYS.forEach((k) => { if (form[k]) p[k] = form[k] }); setSp(p) }
  const goPage = (n) => setSp({ ...query, page: n })
  const saveSearch = async () => {
    const filters = Object.fromEntries(FILTER_KEYS.filter((k) => form[k]).map((k) => [k, form[k]]))
    try { await api('/me/saved-searches/', { method: 'POST', body: { name: 'My search', filters, alert_channel: 'push' } }); setMsg({ ok: 'Saved. We will alert you about new matches.' }) }
    catch (e) { setMsg({ error: e.message }) }
  }

  return (
    <>
    <section className="banner">
      <h1>Find a home you can trust</h1>
      <p>Search verified landlords and checked listings, apply in minutes, and get updates by app, WhatsApp or SMS.</p>
    </section>
    <div className="search-layout">
      <form className="filters card" onSubmit={submit}>
        <div className="row between"><h2>Filters</h2><button type="button" className="link small" onClick={clear}>Clear all</button></div>
        <Field label="Area">
          <select value={form.location} onChange={set('location')}>
            <option value="">Any area</option>
            {suburbs.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="row gap">
          <Field label="Min rent"><input type="number" min="0" value={form.min_rent} onChange={set('min_rent')} /></Field>
          <Field label="Max rent"><input type="number" min="0" value={form.max_rent} onChange={set('max_rent')} /></Field>
        </div>
        <div className="row gap">
          <Field label="Bedrooms">
            <select value={form.bedrooms} onChange={set('bedrooms')}><option value="">Any</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}</select>
          </Field>
          <Field label="Furnishing">
            <select value={form.furnishing} onChange={set('furnishing')}><option value="">Any</option><option value="furnished">Furnished</option><option value="semi_furnished">Semi</option><option value="unfurnished">Unfurnished</option></select>
          </Field>
        </div>
        <Field label="Property type"><select value={form.type} onChange={set('type')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <fieldset>
          <legend>Amenities</legend>
          <div className="checks">
            {amenities.data?.map((a) => (
              <label key={a.slug}><input type="checkbox" checked={selected.includes(a.slug)} onChange={() => toggleAmenity(a.slug)} /> {a.name}</label>
            ))}
          </div>
        </fieldset>
        <label className="check"><input type="checkbox" checked={!!form.verified} onChange={set('verified')} /> Verified landlords only</label>
        <Field label="Sort by">
          <select value={form.sort} onChange={set('sort')}><option value="">Newest</option><option value="price_asc">Cheapest</option><option value="price_desc">Most expensive</option></select>
        </Field>
        <button className="btn">Search</button>
        {user?.role === 'tenant' && <button type="button" className="btn ghost" onClick={saveSearch}>Save search and get alerts</button>}
        <Alert error={msg.error} ok={msg.ok} />
      </form>

      <section>
        <div className="row between"><h1>Homes to rent</h1>{data && <span className="muted">{data.count} found</span>}</div>
        {loading && <p className="muted">Searching…</p>}
        {!loading && data?.count === 0 && <Empty>No homes match. Try a higher budget, fewer filters or another area.</Empty>}
        <div className="grid">{data?.results.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        {data && data.count > 12 && (
          <div className="row gap center">
            <button className="btn ghost" disabled={!data.previous} onClick={() => goPage(page - 1)}>Previous</button>
            <span className="muted">Page {page}</span>
            <button className="btn ghost" disabled={!data.next} onClick={() => goPage(page + 1)}>Next</button>
          </div>
        )}
      </section>
    </div>
    </>
  )
}
