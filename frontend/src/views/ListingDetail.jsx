'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useConfirm } from '@/components/ConfirmDialog'
import Icon from '@/components/Icons'
import Link from '@/components/Link'
import ListingCard from '@/components/ListingCard'
import { Alert, Badge, Field } from '@/components/ui'
import { api, money } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { addDays, fmtDay, isoDay, timeAgo } from '@/lib/format'
import { useFetch } from '@/lib/hooks'
import { useNavigate } from '@/lib/nav-hooks'
import { useSite } from '@/lib/site'
import { toast } from '@/lib/toast'

const FURN = { furnished: 'Furnished', semi_furnished: 'Semi-furnished', unfurnished: 'Unfurnished' }
const pretty = (s) => (s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

function Gallery({ images, title }) {
  const [i, setI] = useState(0)
  const flip = (d) => setI((i + d + images.length) % images.length)
  return (
    <div className="gal">
      <div className="gal-main">
        {images[i] ? <img src={images[i]} alt={`${title}, photo ${i + 1}`} /> : <div><Icon name="image" size={48} /><div className="muted small">No photos yet</div></div>}
        {images.length > 1 && (
          <>
            <button className="car prev" style={{ opacity: 1 }} aria-label="Previous photo" onClick={() => flip(-1)}><Icon name="left" size={16} /></button>
            <button className="car next" style={{ opacity: 1 }} aria-label="Next photo" onClick={() => flip(1)}><Icon name="right" size={16} /></button>
            <span className="pcount"><Icon name="camera" size={12} /> {i + 1}/{images.length}</span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="gal-thumbs">
          {images.map((src, n) => <button key={src} className={n === i ? 'on' : ''} onClick={() => setI(n)} aria-label={`Show photo ${n + 1}`}><img src={src} alt="" /></button>)}
        </div>
      )}
    </div>
  )
}

export default function ListingDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const site = useSite()
  const nav = useNavigate()
  const confirm = useConfirm()
  const { data: l, error, loading, reload } = useFetch(`/listings/${id}/`)
  const [tab, setTab] = useState('apply')
  const [similar, setSimilar] = useState([])
  const [saved, setSaved] = useState(false)

  // Apply form
  const [moveIn, setMoveIn] = useState('')
  const [household, setHousehold] = useState('')
  const [note, setNote] = useState('')
  const [moveTouched, setMoveTouched] = useState(false)
  // Question form
  const [question, setQuestion] = useState('')
  // Viewing form
  const [viewAt, setViewAt] = useState('')
  const [viewNote, setViewNote] = useState('')
  const [busy, setBusy] = useState('')
  const [formError, setFormError] = useState('')

  const isTenant = user?.role === 'tenant'
  useEffect(() => {
    if (!l) return
    api('/listings/', { params: { area: l.location.name, page_size: 4 } }).then((d) => setSimilar(d.results.filter((x) => x.id !== l.id).slice(0, 3))).catch(() => {})
  }, [l?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isTenant && l) api('/me/favourites/').then((list) => setSaved(list.some((x) => x.id === l.id))).catch(() => {})
  }, [isTenant, l?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="muted">Loading…</p>
  if (error) return <Alert error={error} />

  // ---- rules, checked while typing (the server checks them again)
  const maxDays = site.max_move_in_days || 30
  const today = isoDay(new Date())
  const latest = isoDay(addDays(new Date(), maxDays))
  const avail = l.available_from
  const tooFar = avail && avail > latest
  const moveMin = avail && avail > today ? avail : today
  const moveInError = (v) => {
    if (!v) return 'Choose your preferred move-in date.'
    if (v < today) return 'The move-in date cannot be in the past.'
    if (tooFar) return `This home is available from ${fmtDay(avail)}, more than ${maxDays} days away. Please apply closer to that date.`
    if (avail && v < avail) return `This home is only available from ${fmtDay(avail)}. Choose that day or later.`
    if (v > latest) return `That is more than ${maxDays} days away, and landlords will not hold a home that long. Choose a date on or before ${fmtDay(latest)}.`
    return ''
  }
  const moveErr = moveTouched || moveIn ? moveInError(moveIn) : ''
  const householdErr = household && (Number(household) < 1 || Number(household) > 20 || !Number.isInteger(Number(household))) ? 'Enter a whole number from 1 to 20.' : ''
  const questionErr = question && question.trim().length < 10 ? 'Please write at least 10 characters so the landlord can understand.' : ''
  const viewErr = (() => {
    if (!viewAt) return ''
    const d = new Date(viewAt)
    if (Number.isNaN(d.getTime())) return 'Choose a date and time.'
    if (d <= new Date()) return 'Choose a time in the future.'
    if (d > addDays(new Date(), maxDays)) return `Choose a time within the next ${maxDays} days.`
    return ''
  })()

  const run = async (name, fn, okMsg) => {
    setBusy(name); setFormError('')
    try { await fn(); toast.success(okMsg) } catch (e) { setFormError(e.message); toast.error(e.message) } finally { setBusy('') }
  }
  const apply = (e) => {
    e.preventDefault(); setMoveTouched(true)
    if (moveInError(moveIn) || householdErr) return
    run('apply', async () => {
      await api(`/listings/${id}/apply/`, { method: 'POST', body: { desired_move_in: moveIn, household_size: household || null, message: note.trim() } })
      await reload()
    }, 'Application sent. The landlord has been told, and you will get an alert when they respond.')
  }
  const ask = (e) => {
    e.preventDefault()
    if (question.trim().length < 10) return
    run('ask', async () => { await api(`/listings/${id}/enquiries/`, { method: 'POST', body: { message: question.trim() } }); setQuestion('') }, 'Question sent. The landlord will reply, and you will get an alert.')
  }
  const book = (e) => {
    e.preventDefault()
    if (!viewAt || viewErr) return
    run('view', async () => { await api(`/listings/${id}/viewings/`, { method: 'POST', body: { proposed_at: new Date(viewAt).toISOString(), note: viewNote.trim() } }); setViewAt(''); setViewNote('') }, 'Viewing requested. The landlord will confirm a time and tell you where to meet.')
  }

  const gate = () => {
    if (!user) { nav(`/login?next=${encodeURIComponent(`/listings/${id}`)}`); toast.info('Log in with a tenant account to save homes.'); return true }
    if (!isTenant) { toast.info('Saving homes is for tenant accounts.'); return true }
    return false
  }
  const toggleSave = async () => {
    if (gate()) return
    if (saved && !(await confirm({ title: 'Remove from saved homes?', message: 'This home will be removed from your saved homes.', confirmLabel: 'Remove', tone: 'danger' }))) return
    try { await api(`/listings/${id}/favourite/`, { method: saved ? 'DELETE' : 'POST' }); setSaved(!saved); toast.success(saved ? 'Removed from your saved homes.' : 'Saved to your homes.') } catch (e) { toast.error(e.message) }
  }
  const share = async () => {
    const url = window.location.href
    try { if (navigator.share) await navigator.share({ title: l.title, url }); else { await navigator.clipboard.writeText(url); toast.success('Link copied.') } } catch { /* cancelled */ }
  }

  const open = l.status === 'published'
  const place = [l.location.name, l.location.city].filter(Boolean).join(', ')
  const dk = (n) => (n ? Math.round(n) : n)

  return (
    <div className="stack">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span className="sep">›</span><Link to="/">Homes to rent</Link>
        {l.location.name && <><span className="sep">›</span><Link to={`/?area=${encodeURIComponent(l.location.name)}`}>{l.location.name}</Link></>}
        <span className="sep">›</span><span className="here">{l.title}</span>
      </nav>

      <div className="dgrid">
        <div className="stack">
          <Gallery images={l.images} title={l.title} />

          <div className="dhead">
            <div>
              <h1>{l.title}</h1>
              <div className="meta"><span><Icon name="pin" size={15} /> {place}</span><span><Icon name="clock" size={15} /> Listed {timeAgo(l.published_at)}</span><Badge status={l.status} /></div>
            </div>
            <div className="row gap">
              <button className="btn ghost sm" onClick={toggleSave}><Icon name="heart" size={15} filled={saved} /> {saved ? 'Saved' : 'Save'}</button>
              <button className="btn ghost sm" onClick={share}><Icon name="share" size={15} /> Share</button>
            </div>
          </div>

          <div className="facts">
            <div className="fact"><Icon name="bed" /><span><span className="k">Bedrooms</span><span className="v">{l.bedrooms}</span></span></div>
            <div className="fact"><Icon name="bath" /><span><span className="k">Bathrooms</span><span className="v">{l.bathrooms}</span></span></div>
            <div className="fact"><Icon name="sofa" /><span><span className="k">Furnishing</span><span className="v">{FURN[l.furnishing] || pretty(l.furnishing)}</span></span></div>
            <div className="fact"><Icon name="building" /><span><span className="k">Type</span><span className="v">{pretty(l.property_type)}</span></span></div>
            <div className="fact"><Icon name="calendar" /><span><span className="k">Available</span><span className="v">{avail ? fmtDay(avail) : 'Now'}</span></span></div>
            {l.deposit && <div className="fact"><Icon name="dollar" /><span><span className="k">Deposit</span><span className="v">{money(l.deposit, l.currency)}</span></span></div>}
            {l.min_lease_months && <div className="fact"><Icon name="clock" /><span><span className="k">Minimum lease</span><span className="v">{l.min_lease_months} months</span></span></div>}
          </div>

          {l.description && <section className="sect"><h2>About this home</h2><p className="prewrap" style={{ margin: 0 }}>{l.description}</p></section>}
          {l.amenities.length > 0 && (
            <section className="sect"><h2>Features</h2><ul className="feat">{l.amenities.map((a) => <li key={a.slug}><Icon name="check" size={16} /> {a.name}</li>)}</ul></section>
          )}
          <section className="sect">
            <h2>Location</h2>
            <div className="card row gap"><span className="vico"><Icon name="pin" size={20} /></span><div><strong>{place}</strong><div className="muted small">The street address is shared once the placement is confirmed and both fee shares are paid.</div></div></div>
          </section>

          {similar.length > 0 && (
            <section className="sect">
              <h2>More homes in {l.location.name}</h2>
              <div className="pgrid grid">{similar.map((s) => <ListingCard key={s.id} l={s} />)}</div>
            </section>
          )}
        </div>

        <aside className="card sticky">
          <div className="dprice">{money(l.rent, l.currency)} <small>/ month</small></div>
          <div className="row gap wrap" style={{ marginTop: 4 }}>
            <span className="muted">Landlord: <strong>{l.landlord.name}</strong></span>
            {l.landlord.verified && <span className="badge ok">Verified</span>}
          </div>
          {l.landlord.checks?.length > 0 && <div className="chips">{l.landlord.checks.map((c) => <span key={c} className="badge ok">✓ {c}</span>)}</div>}
          {l.fee_estimate && isTenant && (
            <div className="note" style={{ margin: '4px 0' }}>If you apply and are accepted, your share of the platform fee is <strong>{money(l.fee_estimate.tenant_fee, l.fee_estimate.currency)}</strong>. It is only due after you confirm.</div>
          )}

          {!user && (
            <div className="stack">
              <div className="helpnote"><Icon name="info" size={16} /><span>Browsing is free. To apply, ask a question or request a viewing, you need a free tenant account.</span></div>
              {site.registration_open && <Link className="btn block" to={`/register?role=tenant&next=/listings/${id}`}>Create a free account</Link>}
              <Link className="btn ghost block" to={`/login?next=/listings/${id}`}>I already have an account</Link>
            </div>
          )}
          {user && !isTenant && <div className="helpnote"><Icon name="info" size={16} /><span>Log in with a tenant account to apply for this home.</span></div>}

          {isTenant && !open && !l.my_application && <div className="helpnote"><Icon name="info" size={16} /><span>This home is no longer open for applications.</span></div>}
          {isTenant && (open || l.my_application) && (
            <>
              <div className="dtabs" role="tablist">
                <button role="tab" className={tab === 'apply' ? 'on' : ''} onClick={() => setTab('apply')}><Icon name="check" size={15} /> Apply</button>
                <button role="tab" className={tab === 'ask' ? 'on' : ''} onClick={() => setTab('ask')}><Icon name="message" size={15} /> Ask</button>
                <button role="tab" className={tab === 'view' ? 'on' : ''} onClick={() => setTab('view')}><Icon name="calendar" size={15} /> Viewing</button>
              </div>
              {formError && <div className="alert bad" role="alert">{formError}</div>}

              {tab === 'apply' && (l.my_application ? (
                <div className="stack">
                  <div className="note">Your application is <Badge status={l.my_application.status} />. We will alert you when the landlord responds.</div>
                  <Link className="btn sm" to="/deals">View my applications</Link>
                </div>
              ) : (
                <form className="stack" onSubmit={apply} noValidate>
                  <div className="helpnote"><Icon name="info" size={16} /><span>A formal application. If the landlord accepts, you have 48 hours to confirm and your fee share is locked.</span></div>
                  {tooFar && <div className="alert bad" role="alert">This home is available from {fmtDay(avail)}, which is more than {maxDays} days away. Please apply closer to that date.</div>}
                  <Field label="Preferred move-in date" hint={avail && avail > today ? `Available from ${fmtDay(avail)}. Latest allowed: ${fmtDay(latest)}.` : `Available now. Latest allowed: ${fmtDay(latest)}.`} error={moveErr}>
                    <input type="date" value={moveIn} min={moveMin} max={latest} required disabled={tooFar}
                      onChange={(e) => { setMoveIn(e.target.value); setMoveTouched(true) }} onBlur={() => setMoveTouched(true)} />
                  </Field>
                  <Field label="People who will live here (optional)" error={householdErr}>
                    <input type="number" min={1} max={20} step={1} value={household} onChange={(e) => setHousehold(e.target.value)} placeholder="e.g. 3" />
                  </Field>
                  <Field label="About you (optional)" hint="Your work, household and anything else the landlord should know.">
                    <textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                  <div className={`counter ${note.length >= 300 ? 'over' : ''}`}>{note.length}/300</div>
                  <button className="btn block" disabled={busy === 'apply' || tooFar || !!moveInError(moveIn) || !!householdErr}>{busy === 'apply' ? 'Sending…' : 'Send application'}</button>
                </form>
              ))}

              {tab === 'ask' && (
                <form className="stack" onSubmit={ask} noValidate>
                  <div className="helpnote"><Icon name="info" size={16} /><span>A quick question before you decide, for example about water or transport. It does not start an application and costs nothing. You can ask as many as you like.</span></div>
                  <Field label="Your question" error={questionErr}>
                    <textarea rows={4} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Is the borehole water reliable?" />
                  </Field>
                  <div className={`counter ${question.length >= 500 ? 'over' : ''}`}>{question.length}/500</div>
                  <button className="btn block" disabled={busy === 'ask' || question.trim().length < 10}>{busy === 'ask' ? 'Sending…' : 'Send question'}</button>
                </form>
              )}

              {tab === 'view' && (
                <form className="stack" onSubmit={book} noValidate>
                  <div className="helpnote"><Icon name="info" size={16} /><span>Suggest a time to see the home. The landlord confirms it and tells you where to meet. A viewing is free and does not commit you to anything.</span></div>
                  <Field label="Date and time you suggest" error={viewErr}>
                    <input type="datetime-local" value={viewAt} min={`${today}T00:00`} max={`${latest}T23:59`} onChange={(e) => setViewAt(e.target.value)} />
                  </Field>
                  <Field label="Note (optional)"><input value={viewNote} maxLength={200} onChange={(e) => setViewNote(e.target.value)} placeholder="e.g. I can only come after 4pm" /></Field>
                  <button className="btn block" disabled={busy === 'view' || !viewAt || !!viewErr}>{busy === 'view' ? 'Sending…' : 'Request viewing'}</button>
                </form>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
