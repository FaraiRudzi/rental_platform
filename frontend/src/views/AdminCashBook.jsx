'use client'
import { useMemo, useState } from 'react'
import { Alert, Badge, Empty, Field } from '@/components/ui'
import { money, when } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import { toast } from '@/lib/toast'

const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const cell = (v) => {
  let s = String(v ?? '')
  if (/^[=+\-@]/.test(s)) s = `'${s}` // stops spreadsheet programs from treating text as a formula
  return `"${s.replace(/"/g, '""')}"`
}

// Every cash receipt, for reconciling the cash held against the records.
export default function AdminCashBook() {
  const today = new Date()
  const [range, setRange] = useState({ from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDay(today) })
  const { data, error, loading, reload } = useFetch('/admin/cash-book/', range)
  const rows = useMemo(() => data?.rows || [], [data])

  const download = () => {
    const head = ['Receipt', 'Date received', 'Received from', 'Role', 'Home', 'Invoice', 'Deal', 'Amount', 'Currency', 'Status', 'Recorded by', 'Note']
    const lines = rows.map((r) => [r.receipt_no, r.paid_at, r.payer_name, r.payer_role, r.home, r.invoice_no, r.placement_id, r.amount, r.currency, r.status, r.received_by, r.note])
    const csv = [head, ...lines].map((l) => l.map(cell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `cash-book-${range.from}-to-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${rows.length} receipt${rows.length === 1 ? '' : 's'}.`)
  }

  return (
    <div className="stack">
      <div className="note"><strong>Cash book.</strong> Every cash receipt in the period. Check the total against the cash you are holding. Reversed receipts are listed but not counted.</div>
      <div className="row gap wrap" style={{ alignItems: 'flex-end' }}>
        <Field label="From"><input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="To"><input type="date" value={range.to} min={range.from} max={isoDay(today)} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <button className="btn ghost" onClick={reload}>Refresh</button>
        <button className="btn" disabled={rows.length === 0} onClick={download}>Download CSV</button>
      </div>
      <Alert error={error} />
      {data && (
        <div className="stat-row">
          {data.totals.length === 0 && <div><span className="k">Cash received</span><span className="v">0</span></div>}
          {data.totals.map((t) => <div key={t.currency}><span className="k">Cash received ({t.currency})</span><span className="v">{money(t.total, t.currency)}</span></div>)}
          <div><span className="k">Receipts</span><span className="v">{rows.filter((r) => r.status === 'succeeded').length}</span></div>
        </div>
      )}
      {loading && !data && <p className="muted">Loading…</p>}
      {data && rows.length === 0 && <Empty>No cash receipts in this period.</Empty>}
      {rows.length > 0 && (
        <div className="card scroll">
          <table>
            <thead><tr><th>Receipt</th><th>Date</th><th>Received from</th><th>Home</th><th>Amount</th><th>Status</th><th>Recorded by</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.receipt_no}</strong><div className="muted small">{r.invoice_no}</div></td>
                  <td className="nowrap">{when(r.paid_at)}</td>
                  <td>{r.payer_name}<div className="muted small">{r.payer_role}</div></td>
                  <td>{r.home}<div className="muted small">Deal #{r.placement_id}</div></td>
                  <td className="nowrap"><strong>{money(r.amount, r.currency)}</strong></td>
                  <td><Badge status={r.status === 'succeeded' ? 'received' : r.status} /></td>
                  <td>{r.received_by || '–'}{r.note && <div className="muted small">{r.note}</div>}{r.reversal_reason && <div className="small" style={{ color: 'var(--bad)' }}>Reversed: {r.reversal_reason}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
