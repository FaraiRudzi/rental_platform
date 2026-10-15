'use client'

import { useState } from 'react'
import { api, money, when } from '@/lib/api'
import { Alert, Badge, Empty } from './ui'
import { useAction, useFetch } from '@/lib/hooks'

// Shared by tenants and landlords: fee breakdown, invoices, payment, contacts after release.
export default function Placements({ role }) {
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
        return (
          <div className="card" key={p.id}>
            <div className="row between"><h3>{p.listing.title}</h3><Badge status={p.status} /></div>
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
              <div className="note">
                <div className="row between">
                  <span>Your share: <strong>{money(mine.amount, mine.currency)}</strong> <Badge status={mine.status} /></span>
                  {mine.status === 'unpaid' && <button className="btn" disabled={pay.busy} onClick={() => startPay(mine)}>Pay now</button>}
                </div>
                {mine.status === 'unpaid' && <small className="muted">Due by {when(p.payment_deadline)}. Unpaid placements are cancelled automatically.</small>}
                {instructions?.id === mine.id && (
                  <div className="alert ok">
                    <div>Reference: <code>{instructions.reference}</code></div>
                    <div>{instructions.message}</div>
                    {instructions.redirect_url && <a className="btn" href={instructions.redirect_url}>Open payment page</a>}
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
