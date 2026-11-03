'use client'
import { useEffect, useMemo, useState } from 'react'
import { useConfirm } from '@/components/ConfirmDialog'
import Icon from '@/components/Icons'
import IconInput from '@/components/IconInput'
import Link from '@/components/Link'
import ListingCard from '@/components/ListingCard'
import { Alert, EmptyState, Field } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { useNavigate, useSearchParams } from '@/lib/nav-hooks'
import { useSite } from '@/lib/site'
import { toast } from '@/lib/toast'

const KEYS = ['area', 'min_rent', 'max_rent', 'bedrooms', 'bathrooms', 'type', 'furnishing', 'amenities', 'verified', 'available_by', 'q', 'sort']
const PRICES = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000]
const TYPES = [['', 'Any type'], ['house', 'House'], ['flat', 'Flat'], ['cottage', 'Cottage'], ['single_room', 'Single room'], ['shared_room', 'Shared room'], ['backroom', 'Backroom']]
const SORTS = [['', 'Newest first'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low']]
const PAGE_SIZE = 12

function chipLabel(k, v) {
  switch (k) {
    case 'area': return `Area: ${v}`
    case 'min_rent': return `From ${v}`
    case 'max_rent': return `Up to ${v}`
    case 'bedrooms': return `${v}+ bedrooms`
    case 'bathrooms': return `${v}+ bathrooms`
    case 'type': return (TYPES.find(([t]) => t === v) || [0, v])[1]
    case 'furnishing': return v.replace('_', '-')
    case 'amenities': return v.split(',').join(', ')
    case 'verified': return 'Verified landlords'
    case 'available_by': return `Available by ${v}`
    case 'q': return `“${v}”`
    default: return v
  }
}

function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null
  const nums = []
  for (let i = 1; i <= pages; i += 1) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  return (
    <nav className="pager" aria-label="Pages">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Icon name="left" size={16} /></button>
      {nums.map((n, i) => (n === '…'
        ? <span key={`gap${i}`} className="muted" style={{ alignSelf: 'center' }}>…</span>
        : <button key={n} className={n === page ? 'on' : ''} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>))}
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><Icon name="right" size={16} /></button>
    </nav>
  )
}

export default function Search() {
  const { user } = useAuth()
  const site = useSite()
  const nav = useNavigate()
  const confirm = useConfirm()
  const [sp, setSp] = useSearchParams()
  const query = useMemo(() => Object.fromEntries([...sp.entries()]), [sp])
  const page = Number(query.page || 1)
  const [form, setForm] = useState(() => Object.fromEntries(KEYS.map((k) => [k, query[k] || ''])))
  const [more, setMore] = useState(false)
  const [view, setView] = useState('grid')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(new Set())
  const areas = useFetch('/listings/areas/')
  const places = useFetch('/locations/')
  const amenities = useFetch('/amenities/')

  useEffect(() => { setForm(Object.fromEntries(KEYS.map((k) => [k, query[k] || '']))) }, [query])
  useEffect(() => { const v = localStorage.getItem('rp_view'); if (v === 'list' || v === 'grid') setView(v) }, [])
  useEffect(() => {
    setLoading(true)
    api('/listings/', { params: query }).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [query])
  useEffect(() => {
    if (user?.role === 'tenant') api('/me/favourites/').then((l) => setSaved(new Set(l.map((x) => x.id)))).catch(() => {})
    else setSaved(new Set())
  }, [user?.id, user?.role])

  const names = useMemo(() => [...new Set((places.data || []).filter((l) => l.type === 'suburb' || l.type === 'city').map((l) => l.name))].sort(), [places.data])
  const selected = useMemo(() => (form.amenities ? form.amenities.split(',') : []), [form.amenities])
  const priceError = form.min_rent && form.max_rent && Number(form.min_rent) > Number(form.max_rent) ? 'The minimum is higher than the maximum.' : ''
  const chips = KEYS.filter((k) => query[k] && k !== 'sort').map((k) => ({ key: k, label: chipLabel(k, query[k]) }))
  const count = data?.count || 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value })
  const apply = (e) => {
    e?.preventDefault()
    if (priceError) return
    const p = {}
    KEYS.forEach((k) => { if (form[k]) p[k] = form[k] })
    setSp(p)
  }
  const setNow = (k, v) => { const p = { ...query }; delete p.page; if (v) p[k] = v; else delete p[k]; setSp(p) }
  const clearAll = () => setSp({})
  const goPage = (n) => { setSp({ ...query, page: n }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const toggleAmenity = (slug) => setForm({ ...form, amenities: (selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]).join(',') })
  const changeView = (v) => { setView(v); localStorage.setItem('rp_view', v) }

  const needTenant = () => {
    if (!user) { nav(`/login?next=${encodeURIComponent('/')}`); toast.info('Log in with a tenant account to do that.'); return true }
    if (user.role !== 'tenant') { toast.info('Saving homes and alerts are for tenant accounts.'); return true }
    return false
  }
  const toggleSave = async (l) => {
    if (needTenant()) return
    const isSaved = saved.has(l.id)
    if (isSaved && !(await confirm({ title: 'Remove from saved homes?', message: `“${l.title}” will be removed from your saved homes.`, confirmLabel: 'Remove', cancelLabel: 'Keep it', tone: 'danger' }))) return
    try {
      await api(`/listings/${l.id}/favourite/`, { method: isSaved ? 'DELETE' : 'POST' })
      setSaved((prev) => { const n = new Set(prev); if (isSaved) n.delete(l.id); else n.add(l.id); return n })
      toast.success(isSaved ? 'Removed from your saved homes.' : 'Saved. You will find it under Saved.')
    } catch (e) { toast.error(e.message) }
  }
  const saveSearch = async () => {
    if (needTenant()) return
    try {
      await api('/me/saved-searches/', { method: 'POST', body: { name: chips.map((c) => c.label).join(', ') || 'All homes', filters: query, alert_channel: 'push' } })
      toast.success('Search saved. We will alert you when a matching home is listed.')
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="stack">
      <section className="banner">
        <h1>{site.hero_title}</h1>
        <p>{site.hero_subtitle}</p>
        {!user && site.registration_open && (
          <div className="row gap wrap" style={{ marginTop: 16 }}>
            <Link className="btn" to="/register?role=tenant">I am looking for a home</Link>
            <Link className="btn ghost" to="/register?role=landlord">I have a home to let</Link>
          </div>
        )}
      </section>

      <form className="sbar" onSubmit={apply}>
        <div className="sbar-row">
          <Field label="Location"><IconInput className="sb-loc" icon="pin" list="areas-dl" placeholder="Suburb or town, e.g. Avondale" value={form.area} onChange={set('area')} /></Field>
          <Field label="Property type"><select value={form.type} onChange={set('type')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Min price" error={priceError}><select value={form.min_rent} onChange={set('min_rent')}><option value="">No minimum</option>{PRICES.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
          <Field label="Max price"><select value={form.max_rent} onChange={set('max_rent')}><option value="">No maximum</option>{PRICES.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
          <button className="btn sb-go" disabled={!!priceError}><Icon name="search" size={16} /> Search</button>
        </div>
        <datalist id="areas-dl">{names.map((n) => <option key={n} value={n} />)}</datalist>
        <div className="sbar-actions">
          <div className="row gap wrap">
            <span className="muted small" style={{ fontWeight: 700 }}>Bedrooms</span>
            <div className="pills" role="group" aria-label="Bedrooms">
              {[['', 'Any'], ['1', '1+'], ['2', '2+'], ['3', '3+'], ['4', '4+']].map(([v, l]) => (
                <button type="button" key={v || 'any'} className={(query.bedrooms || '') === v ? 'on' : ''} onClick={() => setNow('bedrooms', v)}>{l}</button>
              ))}
            </div>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setMore(!more)} aria-expanded={more}><Icon name="filter" size={15} /> {more ? 'Fewer filters' : 'More filters'}</button>
        </div>
        {more && (
          <div className="adv">
            <Field label="Bathrooms"><select value={form.bathrooms} onChange={set('bathrooms')}><option value="">Any</option>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}+</option>)}</select></Field>
            <Field label="Furnishing"><select value={form.furnishing} onChange={set('furnishing')}><option value="">Any</option><option value="furnished">Furnished</option><option value="semi_furnished">Semi-furnished</option><option value="unfurnished">Unfurnished</option></select></Field>
            <Field label="Available by"><input type="date" value={form.available_by} onChange={set('available_by')} /></Field>
            <Field label="Keyword"><input value={form.q} onChange={set('q')} placeholder="e.g. borehole, garden" /></Field>
            <fieldset style={{ gridColumn: '1 / -1' }}>
              <legend>Features</legend>
              <div className="checks">{amenities.data?.map((a) => <label key={a.slug}><input type="checkbox" checked={selected.includes(a.slug)} onChange={() => toggleAmenity(a.slug)} /> {a.name}</label>)}</div>
            </fieldset>
            <label className="check"><input type="checkbox" checked={!!form.verified} onChange={set('verified')} /> Verified landlords only</label>
          </div>
        )}
      </form>

      {areas.data?.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="muted small" style={{ fontWeight: 700 }}>Popular areas</span>
          <div className="areas">{areas.data.slice(0, 14).map((a) => <button key={a.id} className="achip" onClick={() => setNow('area', a.name)}>{a.name} <b>({a.count})</b></button>)}</div>
        </div>
      )}

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span className="sep">›</span>
        {query.area ? <><Link to="/">Homes to rent</Link><span className="sep">›</span><span className="here">{query.area}</span></> : <span className="here">Homes to rent</span>}
      </nav>

      <div className="toolbar">
        <strong>{loading && !data ? 'Searching…' : count === 0 ? 'No homes found' : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, count)} of ${count} home${count === 1 ? '' : 's'}`}</strong>
        <div className="row gap wrap">
          <button className="btn ghost sm" onClick={saveSearch}><Icon name="bell" size={15} /> Alert me about new homes</button>
          <select aria-label="Sort by" value={query.sort || ''} onChange={(e) => setNow('sort', e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <div className="seg" role="group" aria-label="Layout">
            <button className={view === 'grid' ? 'on' : ''} onClick={() => changeView('grid')} aria-label="Grid view"><Icon name="grid" size={16} /></button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => changeView('list')} aria-label="List view"><Icon name="list" size={16} /></button>
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="fchips">
          {chips.map((c) => <button key={c.key} className="fchip" onClick={() => setNow(c.key, '')} aria-label={`Remove filter ${c.label}`}>{c.label} <Icon name="x" size={13} /></button>)}
          <button className="link small" onClick={clearAll}>Clear all</button>
        </div>
      )}

      <Alert error={error} />
      {data && count === 0 && (
        <EmptyState icon="search" title="No homes match your search">
          Try a different area, a higher budget or fewer filters.{' '}
          <button className="link" onClick={clearAll}>Clear all filters</button>
        </EmptyState>
      )}
      <div className={`pgrid ${view}`}>
        {loading && !data && [1, 2, 3].map((n) => <div key={n} className="pcard sk" />)}
        {data?.results.map((l) => <ListingCard key={l.id} l={l} view={view} saved={saved.has(l.id)} onSave={toggleSave} />)}
      </div>
      <Pager page={page} pages={pages} onPage={goPage} />
    </div>
  )
}
