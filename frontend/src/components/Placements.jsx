'use client'
import { useState } from 'react'
import { api, money, when } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAction, useFetch } from '@/lib/hooks'
import { printReceipt } from '@/lib/receipt'
import { useSite } from '@/lib/site'
import { Alert, Badge, Empty } from './ui'

// Shared by tenants and landlords: fee breakdown, how to pay, receipts, and contact details once unlocked.
export default function Placements({ role }) {
  const site = useSite()
  const { user } = useAuth()
  const { data, error, reload } = useFetch('/placements/')
  const pay = useAction(reload)
  const [instructions, setInstructions] = useState(null)

  const startPay = (inv) => pay.run(async () => setInstructions({ id: inv.id, ...(await api(`/invoices/${inv.id}/pay/`, { method: 'POST', body: { method: 'mobile_money' } })) }))

  return (
    <div className="stack">
      <Alert error={error || pay.error} />
      {data?.length === 0 && <Empty>No confirmed placements yet.</Empty>}
      {data?.map((p) => {
        const mine = p.invoices.find((i) => i.payer_role === role)
        const live = ['awaiting_payment', 'part_paid'].includes(p.status)
        return (
          <div className="card stack" key={p.id}>
            <div className="row between wrap"><h3>{p.listing.title}</h3><Badge status={p.status} /></div>
            <table className="mini">
              <tbody>
                <tr><td>First month's rent</td><td>{money(p.first_rent, p.currency)}</td></tr>
                <tr><td>Platform fee</td><td>{money(p.total_fee, p.currency)}</td></tr>
                <tr><td>Landlord share</td><td>{money(p.landlord_fee, p.currency)}</td></tr>
                <tr><td>Tenant share</td><td>{money(p.tenant_fee, p.currency)}</td></tr>
              </tbody>
            </table>
            {p.status === 'cancelled' && <p className="muted">Cancelled: {p.cancel_reason}</p>}

            {mine && (
              <div className="note stack" style={{ gap: 10 }}>
                <div className="row between wrap">
                  <span>
                    Your share: <strong>{money(mine.amount, mine.currency)}</strong> · received {money(mine.paid_total, mine.currency)} · balance <strong>{money(mine.balance, mine.currency)}</strong>
                  </span>
                  <Badge status={mine.status} />
                </div>

                {mine.status === 'unpaid' && live && (site.online_payments_enabled ? (
                  <>
                    <div className="row between wrap">
                      <small className="muted">Due by {when(p.payment_deadline)}. Unpaid placements are cancelled automatically.</small>
                      <button className="btn" disabled={pay.busy} onClick={() => startPay(mine)}>{pay.busy ? 'Starting…' : 'Pay now'}</button>
                    </div>
                    {instructions?.id === mine.id && (
                      <div className="alert ok">
                        <div>Reference: <code>{instructions.reference}</code></div>
                        <div>{instructions.message}</div>
                        {instructions.redirect_url && <a className="btn" href={instructions.redirect_url}>Open payment page</a>}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="cash-box">
                    <strong>Pay your share in cash</strong>
                    <p>{site.cash_instructions}</p>
                    <ul>
                      <li>Amount to pay: <strong>{money(mine.balance, mine.currency)}</strong></li>
                      <li>Quote this reference: <strong>{mine.invoice_no}</strong></li>
                      <li>Pay by: <strong>{when(p.payment_deadline)}</strong></li>
                    </ul>
                    <p className="muted small">An admin records your payment. You will get an alert, and your receipt will appear here. Unpaid placements are cancelled automatically after the deadline.</p>
                  </div>
                ))}

                {mine.payments?.length > 0 && (
                  <div className="stack" style={{ gap: 8 }}>
                    <strong>Your receipts</strong>
                    {mine.payments.map((r) => (
                      <div key={r.id} className={`receipt-row ${r.status === 'reversed' ? 'is-reversed' : ''}`}>
                        <div className="row between wrap">
                          <div>
                            <strong>{r.receipt_no}</strong> · {money(r.amount, mine.currency)} <span className="muted small">received {when(r.paid_at)}</span>
                            {r.status === 'reversed' && <div className="small" style={{ color: 'var(--bad)' }}>Reversed: {r.reversal_reason}</div>}
                          </div>
                          <div className="row gap">
                            <Badge status={r.status === 'succeeded' ? 'received' : r.status} />
                            {r.status !== 'reversed' && <button className="link small" onClick={() => printReceipt({ site, home: p.listing.title, payerName: user.full_name, role, invoice: mine, receipt: r, placementId: p.id })}>Print receipt</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {p.contacts ? (
              <div className="alert ok"><strong>Contact details</strong><div>{p.contacts.name}: <a href={`tel:${p.contacts.phone}`}>{p.contacts.phone}</a></div>{p.contacts.address && <div>Address: {p.contacts.address}</div>}</div>
            ) : p.status !== 'cancelled' && <p className="muted small">Contact details and the address unlock once both fee shares are paid.</p>}
          </div>
        )
      })}
    </div>
  )
}
