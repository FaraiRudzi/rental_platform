import { useState } from 'react'
import { api, money, when } from '../api'
import { Alert, Badge, Empty, Field } from '../components/ui'
import { useAction, useFetch } from '../hooks'

const TABS = [['stats', 'Overview'], ['rules', 'Fee rules'], ['listings', 'Listing review'], ['users', 'Users'], ['placements', 'Placements']]

export default function Admin() {
  const [tab, setTab] = useState('stats')
  return (
    <div className="stack">
      <h1>Admin</h1>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'stats' && <Stats />}
      {tab === 'rules' && <Rules />}
      {tab === 'listings' && <ListingReview />}
      {tab === 'users' && <Users />}
      {tab === 'placements' && <AdminPlacements />}
    </div>
  )
}

function Stats() {
  const { data, error } = useFetch('/admin/stats/')
  if (error) return <Alert error={error} />
  if (!data) return <p className="muted">Loading…</p>
  const f = data.funnel
  return (
    <div className="stack">
      <div className="stats">
        {[['Published listings', f.published_listings], ['Applications', f.applications], ['Accepted', f.accepted], ['Confirmed placements', f.confirmed_placements], ['Fully paid', f.fully_paid]].map(([l, v]) => (
          <div className="card stat" key={l}><div className="num">{v}</div><div className="muted">{l}</div></div>
        ))}
      </div>
      <div className="card"><h3>Fees collected</h3>{data.revenue_collected.length ? data.revenue_collected.map((r) => <div key={r.currency}>{money(r.total, r.currency)}</div>) : <span className="muted">Nothing yet.</span>}</div>
      <div className="card">
        <h3>Possible leakage</h3>
        <p className="muted small">Landlords who accepted 3+ applicants but rarely confirm a placement. Worth a phone call.</p>
        {data.possible_leakage.length ? data.possible_leakage.map((l) => <div key={l.landlord_id}>{l.name}: {l.accepted} accepted, {l.placements} placements</div>) : <span className="muted">None flagged.</span>}
      </div>
      <div className="card">
        <h3>Searches with no results (last 30 days)</h3>
        <p className="muted small">Demand without supply. Recruit landlords in these areas first.</p>
        {data.zero_result_searches.length ? data.zero_result_searches.slice(0, 15).map((s, i) => <div key={i} className="small">{JSON.stringify(s.filters)} <span className="muted">· {s.channel}</span></div>) : <span className="muted">None.</span>}
      </div>
    </div>
  )
}

const emptyRule = { name: '', fee_type: 'percentage', value: '10', min_fee: '', max_fee: '', landlord_share_pct: '60', tenant_share_pct: '40', scope_type: 'global', scope: '', rent_min: '', rent_max: '', currency: 'USD', priority: 0, effective_from: new Date().toISOString().slice(0, 10), effective_to: '', is_active: true }

function Rules() {
  const { data, error, reload } = useFetch('/admin/commission-rules/')
  const locs = useFetch('/locations/')
  const [edit, setEdit] = useState(null)
  const [audit, setAudit] = useState(null)
  const act = useAction(reload)
  const nul = (v) => (v === '' ? null : v)

  const save = () => act.run(async () => {
    const b = { ...edit, min_fee: nul(edit.min_fee), max_fee: nul(edit.max_fee), rent_min: nul(edit.rent_min), rent_max: nul(edit.rent_max), effective_to: nul(edit.effective_to), scope: edit.scope_type === 'global' ? null : Number(edit.scope) }
    await api(edit.id ? `/admin/commission-rules/${edit.id}/` : '/admin/commission-rules/', { method: edit.id ? 'PUT' : 'POST', body: b })
    setEdit(null)
  }, 'Rule saved. It applies to future placements only.')

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    const next = { ...edit, [k]: v }
    if (k === 'landlord_share_pct') next.tenant_share_pct = String(100 - Number(v || 0))
    if (k === 'tenant_share_pct') next.landlord_share_pct = String(100 - Number(v || 0))
    setEdit(next)
  }
  const loadAudit = async (id) => setAudit({ id, rows: await api(`/admin/commission-rules/${id}/audit/`) })

  return (
    <div className="stack">
      <Alert error={error || act.error} ok={act.ok} />
      <div className="row between"><p className="muted">The most specific active rule wins: suburb, then city, then global. Existing placements keep the terms they were confirmed under.</p><button className="btn" onClick={() => setEdit(emptyRule)}>+ New rule</button></div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Name</th><th>Fee</th><th>Min / Max</th><th>Landlord / Tenant</th><th>Scope</th><th>Rent band</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.fee_type === 'percentage' ? `${Number(r.value)}%` : money(r.value, r.currency)}</td>
                <td>{r.min_fee ?? '–'} / {r.max_fee ?? '–'}</td>
                <td>{Number(r.landlord_share_pct)} / {Number(r.tenant_share_pct)}</td>
                <td>{r.scope_type}{r.scope ? ` #${r.scope}` : ''}</td>
                <td>{r.rent_min ?? '–'} to {r.rent_max ?? '–'}</td>
                <td><Badge status={r.is_active ? 'active' : 'archived'} /></td>
                <td className="nowrap"><button className="link" onClick={() => setEdit({ ...r, scope: r.scope ?? '', min_fee: r.min_fee ?? '', max_fee: r.max_fee ?? '', rent_min: r.rent_min ?? '', rent_max: r.rent_max ?? '', effective_to: r.effective_to ?? '' })}>Edit</button> <button className="link" onClick={() => loadAudit(r.id)}>History</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <Empty>No rules. Placements cannot be confirmed without one.</Empty>}
      </div>

      {audit && (
        <div className="card"><div className="row between"><h3>Change history, rule #{audit.id}</h3><button className="link" onClick={() => setAudit(null)}>Close</button></div>
          {audit.rows.map((a) => <div key={a.id} className="small"><strong>{a.action}</strong> by {a.by || 'system'} · {when(a.at)}</div>)}
        </div>
      )}

      {edit && (
        <div className="card">
          <h3>{edit.id ? 'Edit rule' : 'New rule'}</h3>
          <div className="grid2">
            <Field label="Name"><input value={edit.name} onChange={set('name')} /></Field>
            <Field label="Fee type"><select value={edit.fee_type} onChange={set('fee_type')}><option value="percentage">Percentage of first rent</option><option value="flat">Flat amount</option></select></Field>
            <Field label={edit.fee_type === 'percentage' ? 'Percentage (e.g. 10)' : 'Flat amount'}><input type="number" step="0.01" value={edit.value} onChange={set('value')} /></Field>
            <Field label="Currency"><input value={edit.currency} maxLength={3} onChange={set('currency')} /></Field>
            <Field label="Minimum fee"><input type="number" step="0.01" value={edit.min_fee} onChange={set('min_fee')} /></Field>
            <Field label="Maximum fee"><input type="number" step="0.01" value={edit.max_fee} onChange={set('max_fee')} /></Field>
            <Field label="Landlord share %"><input type="number" value={edit.landlord_share_pct} onChange={set('landlord_share_pct')} /></Field>
            <Field label="Tenant share %" hint="Always adds up to 100"><input type="number" value={edit.tenant_share_pct} onChange={set('tenant_share_pct')} /></Field>
            <Field label="Scope"><select value={edit.scope_type} onChange={set('scope_type')}><option value="global">Global</option><option value="city">City</option><option value="suburb">Suburb</option></select></Field>
            {edit.scope_type !== 'global' && (
              <Field label="Location"><select value={edit.scope} onChange={set('scope')}><option value="">Choose…</option>{locs.data?.filter((l) => l.type === edit.scope_type).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            )}
            <Field label="Rent from (optional)"><input type="number" value={edit.rent_min} onChange={set('rent_min')} /></Field>
            <Field label="Rent up to (optional)"><input type="number" value={edit.rent_max} onChange={set('rent_max')} /></Field>
            <Field label="Priority" hint="Breaks ties between equal matches"><input type="number" value={edit.priority} onChange={set('priority')} /></Field>
            <Field label="Effective from"><input type="date" value={edit.effective_from} onChange={set('effective_from')} /></Field>
            <Field label="Effective to (optional)"><input type="date" value={edit.effective_to} onChange={set('effective_to')} /></Field>
            <label className="check"><input type="checkbox" checked={edit.is_active} onChange={set('is_active')} /> Active</label>
          </div>
          <div className="row gap"><button className="btn" disabled={act.busy} onClick={save}>Save rule</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
    </div>
  )
}

function ListingReview() {
  const { data, error, reload } = useFetch('/admin/listings/')
  const act = useAction(reload)
  const [reason, setReason] = useState({})
  return (
    <div className="stack">
      <Alert error={error || act.error} ok={act.ok} />
      {data?.length === 0 && <Empty>Nothing waiting for review.</Empty>}
      {data?.map((l) => (
        <div className="card" key={l.id}>
          <div className="row between"><h3>{l.title}</h3><span className="muted">{money(l.rent, l.currency)}</span></div>
          <p className="muted">{l.location.name} · {l.address_line} · landlord {l.landlord.name} {l.landlord.verified ? <span className="badge ok">verified</span> : <span className="badge warn">not verified</span>}</p>
          {l.duplicate_photo && <div className="alert bad">One or more photos also appear on another landlord's listing.</div>}
          <div className="thumbs">{l.images.map((s) => <img key={s} src={s} alt="" />)}</div>
          <div className="row gap wrap">
            <button className="btn" disabled={act.busy} onClick={() => act.run(() => api(`/admin/listings/${l.id}/review/`, { method: 'POST', body: { action: 'approve' } }), 'Approved and published.')}>Approve</button>
            <input placeholder="Reason if rejecting" value={reason[l.id] || ''} onChange={(e) => setReason({ ...reason, [l.id]: e.target.value })} />
            <button className="btn danger" disabled={act.busy} onClick={() => act.run(() => api(`/admin/listings/${l.id}/review/`, { method: 'POST', body: { action: 'reject', reason: reason[l.id] } }), 'Rejected.')}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Users() {
  const [filters, setFilters] = useState({ role: '', verification_status: '' })
  const { data, error, reload } = useFetch('/admin/users/', filters)
  const docs = useFetch('/admin/verification-docs/')
  const act = useAction(() => { reload(); docs.reload() })
  const setVer = (id, status) => act.run(() => api(`/admin/users/${id}/verification/`, { method: 'POST', body: { status } }))
  const review = (id, status) => act.run(() => api(`/admin/verification-docs/${id}/review/`, { method: 'POST', body: { status } }))
  const openDoc = async (id) => {
    const t = JSON.parse(localStorage.getItem('rp_tokens'))
    const res = await fetch(`/api/admin/verification-docs/${id}/file/`, { headers: { Authorization: `Bearer ${t.access}` } })
    if (res.ok) window.open(URL.createObjectURL(await res.blob()), '_blank')
  }
  return (
    <div className="stack">
      <Alert error={error || act.error} />
      <h3>Documents waiting for review</h3>
      {docs.data?.length === 0 && <Empty>None.</Empty>}
      {docs.data?.map((d) => (
        <div key={d.id} className="card row between">
          <div>{d.user.name} ({d.user.role}) · {d.doc_type.replace('_', ' ')}</div>
          <div className="row gap"><button className="btn ghost" onClick={() => openDoc(d.id)}>Open</button><button className="btn" onClick={() => review(d.id, 'approved')}>Approve</button><button className="btn danger" onClick={() => review(d.id, 'rejected')}>Reject</button></div>
        </div>
      ))}
      <h3>Users</h3>
      <div className="row gap">
        <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}><option value="">All roles</option><option>tenant</option><option>landlord</option><option>admin</option></select>
        <select value={filters.verification_status} onChange={(e) => setFilters({ ...filters, verification_status: e.target.value })}><option value="">Any verification</option><option>unverified</option><option>pending</option><option>verified</option><option>rejected</option></select>
      </div>
      <div className="card scroll"><table>
        <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Verification</th><th /></tr></thead>
        <tbody>{data?.map((u) => (
          <tr key={u.id}><td>{u.full_name}</td><td>{u.phone}</td><td>{u.role}</td><td><Badge status={u.verification_status} /></td>
            <td className="nowrap"><button className="link" onClick={() => setVer(u.id, 'verified')}>Verify</button> <button className="link" onClick={() => setVer(u.id, 'rejected')}>Reject</button> <button className="link" onClick={() => act.run(() => api(`/admin/users/${u.id}/status/`, { method: 'POST', body: { status: u.status === 'active' ? 'suspended' : 'active' } }))}>{u.status === 'active' ? 'Suspend' : 'Reinstate'}</button></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  )
}

function AdminPlacements() {
  const { data, error, reload } = useFetch('/admin/placements/')
  const act = useAction(reload)
  return (
    <div className="stack">
      <Alert error={error || act.error} ok={act.ok} />
      {data?.length === 0 && <Empty>No placements yet.</Empty>}
      {data?.map((p) => (
        <div className="card" key={p.id}>
          <div className="row between"><h3>#{p.id} {p.listing.title}</h3><Badge status={p.status} /></div>
          <p className="muted">Rent {money(p.first_rent, p.currency)} · fee {money(p.total_fee, p.currency)} (landlord {money(p.landlord_fee, p.currency)}, tenant {money(p.tenant_fee, p.currency)}) · confirmed {when(p.confirmed_at)}</p>
          {p.invoices.map((i) => (
            <div key={i.id} className="row between small">
              <span>{i.invoice_no} · {i.payer_role} · {money(i.amount, i.currency)} <Badge status={i.status} /></span>
              {i.status === 'unpaid' && <span className="row gap">
                <button className="link" onClick={() => act.run(() => api(`/admin/invoices/${i.id}/record-payment/`, { method: 'POST', body: { method: 'cash' } }), 'Payment recorded.')}>Record cash payment</button>
                <button className="link" onClick={() => { const r = prompt('Reason for waiving this fee?'); if (r) act.run(() => api(`/admin/invoices/${i.id}/waive/`, { method: 'POST', body: { reason: r } }), 'Waived.') }}>Waive</button>
              </span>}
            </div>
          ))}
          {!['cancelled', 'active'].includes(p.status) && <button className="btn danger" onClick={() => { const r = prompt('Reason for cancelling?'); if (r) act.run(() => api(`/admin/placements/${p.id}/cancel/`, { method: 'POST', body: { reason: r } }), 'Cancelled.') }}>Cancel placement</button>}
        </div>
      ))}
    </div>
  )
}
