'use client'
import { useMemo, useState } from 'react'
import { Alert, Badge, Empty, Field } from '@/components/ui'
import { api, money, when } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import { printReceipt } from '@/lib/receipt'
import { useSite } from '@/lib/site'
import { toast } from '@/lib/toast'

const FILTERS = [['awaiting_payment', 'Waiting for payment'], ['part_paid', 'Part paid'], ['paid', 'Paid'], ['active', 'Active'], ['cancelled', 'Cancelled'], ['', 'All']]
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const num = (v) => Number(v) || 0

// Runs one admin action: busy state, an error shown inside the form, a message at the corner, then refresh.
function useSubmit(onDone) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (fn) => {
    setBusy(true); setError('')
    try {
      const r = await fn()
      if (r?.detail) toast.success(r.detail)
      if (onDone) onDone()
      return r
    } catch (e) { setError(e.message); toast.error(e.message) } finally { setBusy(false) }
  }
  return { busy, error, setError, submit }
}

function FormButtons({ busy, label, busyLabel, disabled, onCancel, danger }) {
  return (
    <div className="row gap wrap">
      <button className={`btn ${danger ? 'danger' : ''}`} disabled={busy || disabled}>{busy ? busyLabel : label}</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  )
}

function CashForm({ inv, onDone, onCancel }) {
  const balance = num(inv.balance)
  const nowLocal = toLocalInput(new Date())
  const [f, setF] = useState({ amount: balance.toFixed(2), when: nowLocal, receipt: '', note: '', confirm: false })
  const { busy, error, setError, submit } = useSubmit(onDone)
  const amount = num(f.amount)
  const valid = amount > 0 && amount <= balance + 0.0001
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const go = (e) => {
    e.preventDefault()
    if (!valid) { setError(`Enter an amount between 0.01 and ${balance.toFixed(2)}.`); return }
    if (!f.confirm) { setError('Tick the box to confirm you have received this cash.'); return }
    submit(() => api(`/admin/invoices/${inv.id}/record-payment/`, {
      method: 'POST',
      body: { amount: f.amount, received_at: new Date(f.when).toISOString(), receipt_no: f.receipt.trim(), note: f.note.trim() },
    }))
  }

  return (
    <form className="inline-form" onSubmit={go}>
      <h4 style={{ margin: 0 }}>Record cash received from {inv.payer_name}</h4>
      <Alert error={error} />
      <div className="two">
        <Field label={`Amount received (${inv.currency})`} hint={`Balance due: ${money(balance, inv.currency)}. Part payments are allowed.`}>
          <div className="money-input"><span>{inv.currency}</span>
            <input type="number" inputMode="decimal" step="0.01" min="0.01" max={balance} value={f.amount} onChange={set('amount')} required autoFocus />
          </div>
        </Field>
        <Field label="Date and time received">
          <input type="datetime-local" value={f.when} max={nowLocal} onChange={set('when')} required />
        </Field>
      </div>
      <div className="row gap wrap"><button type="button" className="link small" onClick={() => setF({ ...f, amount: balance.toFixed(2) })}>Use the full balance</button></div>
      <div className="two">
        <Field label="Receipt number (optional)" hint="Leave blank and one is created for you. Type your receipt book number if you use one.">
          <input value={f.receipt} onChange={set('receipt')} maxLength={60} placeholder="e.g. 0457" />
        </Field>
        <Field label="Note (optional)" hint="For example: paid to agent at the office.">
          <input value={f.note} onChange={set('note')} maxLength={200} />
        </Field>
      </div>
      {valid && (
        <div className="note">After this receipt: <strong>{money(num(inv.paid_total) + amount, inv.currency)}</strong> received of {money(inv.amount, inv.currency)}.
          {amount >= balance - 0.0001 ? ' This share will be marked paid.' : ` Balance left: ${money(balance - amount, inv.currency)}.`}</div>
      )}
      <label className="consent"><input type="checkbox" checked={f.confirm} onChange={set('confirm')} /> <span>I have received this cash.</span></label>
      <FormButtons busy={busy} label="Record payment" busyLabel="Recording…" disabled={!valid} onCancel={onCancel} />
    </form>
  )
}

function AdjustForm({ p, inv, onDone, onCancel }) {
  const received = num(inv.paid_total)
  const [amount, setAmount] = useState(num(inv.amount).toFixed(2))
  const [reason, setReason] = useState('')
  const { busy, error, setError, submit } = useSubmit(onDone)
  const diff = num(amount) - num(inv.amount)
  const valid = num(amount) >= received && Math.abs(diff) > 0.0001 && reason.trim().length >= 5

  const go = (e) => {
    e.preventDefault()
    if (num(amount) < received) { setError(`${money(received, inv.currency)} has already been received, so the share cannot go below that.`); return }
    if (Math.abs(diff) < 0.0001) { setError('That is the same amount as now.'); return }
    if (reason.trim().length < 5) { setError('Give a reason for the change.'); return }
    submit(() => api(`/admin/placements/${p.id}/adjust-fee/`, { method: 'POST', body: { party: inv.payer_role, new_amount: amount, reason: reason.trim() } }))
  }

  return (
    <form className="inline-form" onSubmit={go}>
      <h4 style={{ margin: 0 }}>Change the {inv.payer_role} platform fee share</h4>
      <Alert error={error} />
      <Field label={`New fee share (${inv.currency})`} hint={`Currently ${money(inv.amount, inv.currency)}.${received > 0 ? ` Already received ${money(received, inv.currency)}, so it cannot go below that.` : ''}`}>
        <div className="money-input"><span>{inv.currency}</span>
          <input type="number" inputMode="decimal" step="0.01" min={received} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </div>
      </Field>
      <Field label="Reason" hint="Kept in the record and sent to the person. For example: agreed discount, or rent was entered wrongly.">
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required />
      </Field>
      {Math.abs(diff) > 0.0001 && <div className="note">The {inv.payer_role} share changes from <strong>{money(inv.amount, inv.currency)}</strong> to <strong>{money(num(amount), inv.currency)}</strong> ({diff > 0 ? '+' : '−'}{money(Math.abs(diff), inv.currency)}).</div>}
      <FormButtons busy={busy} label="Update fee" busyLabel="Updating…" disabled={!valid} onCancel={onCancel} />
    </form>
  )
}

function WaiveForm({ inv, onDone, onCancel }) {
  const [reason, setReason] = useState('')
  const { busy, error, submit } = useSubmit(onDone)
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); submit(() => api(`/admin/invoices/${inv.id}/waive/`, { method: 'POST', body: { reason: reason.trim() } })) }}>
      <h4 style={{ margin: 0 }}>Waive the remaining {money(inv.balance, inv.currency)}</h4>
      <p className="muted small" style={{ margin: 0 }}>The person no longer has to pay the balance. Cash already received is kept.</p>
      <Alert error={error} />
      <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required minLength={5} autoFocus /></Field>
      <FormButtons busy={busy} label="Waive the balance" busyLabel="Waiving…" disabled={reason.trim().length < 5} onCancel={onCancel} />
    </form>
  )
}

function ReceiptRow({ p, inv, r, canReverse, onChanged }) {
  const site = useSite()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const { busy, error, submit } = useSubmit(() => { setOpen(false); onChanged() })
  const reversed = r.status === 'reversed'
  const print = () => printReceipt({ site, home: p.listing.title, payerName: inv.payer_name, role: inv.payer_role, invoice: inv, receipt: r, placementId: p.id })
  return (
    <div className={`receipt-row ${reversed ? 'is-reversed' : ''}`}>
      <div className="row between wrap">
        <div>
          <strong>{r.receipt_no}</strong> · {money(r.amount, inv.currency)}{' '}
          <span className="muted small">received {when(r.paid_at)}{r.received_by && ` by ${r.received_by}`}</span>
          {r.note && <div className="muted small">Note: {r.note}</div>}
          {reversed && <div className="small" style={{ color: 'var(--bad)' }}>Reversed: {r.reversal_reason}</div>}
        </div>
        <div className="row gap">
          <Badge status={r.status === 'succeeded' ? 'received' : r.status} />
          {!reversed && <button className="link small" onClick={print}>Print receipt</button>}
          {canReverse && r.status === 'succeeded' && !open && <button className="link small" onClick={() => setOpen(true)}>Reverse</button>}
        </div>
      </div>
      {open && (
        <div className="confirm-panel">
          <Field label="Why is this receipt being reversed? (it was recorded by mistake)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus />
          </Field>
          {error && <div className="alert bad">{error}</div>}
          <div className="row gap wrap">
            <button className="btn danger" disabled={busy || reason.trim().length < 5} onClick={() => submit(() => api(`/admin/payments/${r.id}/reverse/`, { method: 'POST', body: { reason: reason.trim() } }))}>{busy ? 'Reversing…' : 'Reverse this receipt'}</button>
            <button className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  )
}

function InvoiceBlock({ p, inv, onChanged }) {
  const [open, setOpen] = useState(null) // 'cash' | 'adjust' | 'waive'
  const live = ['awaiting_payment', 'part_paid'].includes(p.status)
  const canAct = live && inv.status === 'unpaid'
  const done = () => { setOpen(null); onChanged() }
  const toggle = (name) => setOpen(open === name ? null : name)
  return (
    <div className="invoice-block">
      <div className="row between wrap">
        <div>
          <strong>{inv.payer_role === 'landlord' ? 'Landlord' : 'Tenant'} share · {inv.payer_name}</strong>
          <div className="muted small">{inv.invoice_no} · due {inv.due_date}</div>
        </div>
        <div className="amounts">
          <div><span className="muted small">Fee share</span><strong>{money(inv.amount, inv.currency)}</strong></div>
          <div><span className="muted small">Received</span><strong>{money(inv.paid_total, inv.currency)}</strong></div>
          <div><span className="muted small">Balance</span><strong>{money(inv.balance, inv.currency)}</strong></div>
          <Badge status={inv.status} />
        </div>
      </div>

      {inv.payments.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {inv.payments.map((r) => <ReceiptRow key={r.id} p={p} inv={inv} r={r} canReverse={live && !p.contacts_released_at} onChanged={onChanged} />)}
        </div>
      )}

      {canAct && (
        <div className="row gap wrap">
          <button className={`btn ${open === 'cash' ? '' : ''}`} onClick={() => toggle('cash')}>{open === 'cash' ? 'Close' : 'Record cash payment'}</button>
          <button className="btn ghost" onClick={() => toggle('adjust')}>Change fee</button>
          <button className="btn ghost" onClick={() => toggle('waive')}>Waive balance</button>
        </div>
      )}
      {open === 'cash' && <CashForm inv={inv} onDone={done} onCancel={() => setOpen(null)} />}
      {open === 'adjust' && <AdjustForm p={p} inv={inv} onDone={done} onCancel={() => setOpen(null)} />}
      {open === 'waive' && <WaiveForm inv={inv} onDone={done} onCancel={() => setOpen(null)} />}
    </div>
  )
}

function CancelPanel({ p, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const { busy, error, submit } = useSubmit(() => { setOpen(false); onDone() })
  if (!open) return <div><button className="btn danger" onClick={() => setOpen(true)}>Cancel this placement</button></div>
  return (
    <div className="confirm-panel">
      <strong>Cancel placement #{p.id}?</strong>
      <span className="small">The home is reopened and both people are told. Any cash already received is marked for refund: you must hand it back yourself, and the record will show it.</span>
      <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus /></Field>
      {error && <div className="alert bad">{error}</div>}
      <div className="row gap wrap">
        <button className="btn danger" disabled={busy || reason.trim().length < 5} onClick={() => submit(() => api(`/admin/placements/${p.id}/cancel/`, { method: 'POST', body: { reason: reason.trim() } }))}>{busy ? 'Cancelling…' : 'Yes, cancel it'}</button>
        <button className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>No, keep it</button>
      </div>
    </div>
  )
}

function PlacementCard({ p, onChanged }) {
  const live = ['awaiting_payment', 'part_paid'].includes(p.status)
  return (
    <div className="card stack">
      <div className="row between wrap">
        <div>
          <h3>#{p.id} {p.listing.title}</h3>
          <div className="muted small">Landlord {p.landlord_name} · Tenant {p.tenant_name} · confirmed {when(p.confirmed_at)}{live && p.payment_deadline && ` · pay by ${when(p.payment_deadline)}`}</div>
        </div>
        <Badge status={p.status} />
      </div>
      <div className="stat-row">
        <div><span className="k">First rent</span><span className="v">{money(p.first_rent, p.currency)}</span></div>
        <div><span className="k">Platform fee</span><span className="v">{money(p.total_fee, p.currency)}</span></div>
        <div><span className="k">Cash received</span><span className="v">{money(p.collected, p.currency)}</span></div>
        <div><span className="k">Still to collect</span><span className="v">{money(p.outstanding, p.currency)}</span></div>
      </div>
      {p.status === 'cancelled' && <p className="muted">Cancelled: {p.cancel_reason}</p>}
      {p.invoices.map((inv) => <InvoiceBlock key={inv.id} p={p} inv={inv} onChanged={onChanged} />)}
      {p.contacts_released_at && <p className="muted small">Contact details were released on {when(p.contacts_released_at)}.</p>}
      {live && <CancelPanel p={p} onDone={onChanged} />}
    </div>
  )
}

export default function AdminPlacements() {
  const [filter, setFilter] = useState('awaiting_payment')
  const [q, setQ] = useState('')
  const { data, error, reload } = useFetch('/admin/placements/', { status: filter })
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data || []).filter((p) => !term || `${p.listing.title} ${p.landlord_name} ${p.tenant_name} #${p.id}`.toLowerCase().includes(term))
  }, [data, q])

  return (
    <div className="stack">
      <div className="note">
        <strong>Cash payments.</strong> People pay their share of the platform fee in cash. When you receive it, open the deal and press
        <em> Record cash payment</em>: enter the amount, the date and a receipt number, and tick the confirmation. Part payments are fine. When both sides have
        paid in full, the contact details are released automatically. Use <em>Change fee</em> for a discount or correction, and <em>Reverse</em> if a receipt was recorded by mistake.
      </div>
      <div className="tabs">{FILTERS.map(([k, l]) => <button key={k || 'all'} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
      <div className="row gap wrap">
        <input className="search-input" type="search" placeholder="Search by home, landlord, tenant or deal number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search deals" />
        <button className="btn ghost" onClick={() => { reload(); toast.info('List refreshed.') }}>Refresh</button>
      </div>
      <Alert error={error} />
      {data && rows.length === 0 && <Empty>{q ? 'No deals match your search.' : 'No deals here.'}</Empty>}
      {rows.map((p) => <PlacementCard key={p.id} p={p} onChanged={reload} />)}
    </div>
  )
}
