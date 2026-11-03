import { money, when } from './api'
import { toast } from './toast'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Opens a clean, printable cash receipt in a new window.
export function printReceipt({ site, home, payerName, role, invoice, receipt, placementId }) {
  const w = window.open('', '_blank', 'width=760,height=920')
  if (!w) { toast.error('Allow pop-ups for this site, then try printing the receipt again.'); return }
  const cur = invoice.currency
  const row = (label, value) => `<tr><td class="l">${esc(label)}</td><td>${value}</td></tr>`
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(receipt.receipt_no)}</title>
<style>
  body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:0;padding:36px}
  .box{max-width:640px;margin:0 auto;border:2px solid #111;border-radius:10px;padding:28px}
  h1{margin:0;font-size:22px}.sub{color:#555;margin:2px 0 18px}.big{font-size:30px;font-weight:800;margin:8px 0 18px}
  table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px solid #ddd;vertical-align:top}td.l{color:#555;width:42%}
  .sig{margin-top:44px;display:flex;justify-content:space-between;color:#555;font-size:13px}.sig div{border-top:1px solid #111;padding-top:4px;width:44%}
  .foot{margin-top:22px;color:#666;font-size:12px;text-align:center}
  @media print{body{padding:0}.noprint{display:none}}
</style></head><body><div class="box">
  <h1>${esc(site.company_name)}</h1><div class="sub">${esc(site.site_name)} · Cash receipt</div>
  <div class="big">${esc(money(receipt.amount, cur))}</div>
  <table>
    ${row('Receipt number', `<strong>${esc(receipt.receipt_no)}</strong>`)}
    ${row('Date received', esc(when(receipt.paid_at)))}
    ${row('Received from', `${esc(payerName)} (${esc(role)})`)}
    ${row('For', `Placement fee share, ${esc(home)}`)}
    ${row('Deal and invoice', `#${esc(placementId)} · ${esc(invoice.invoice_no)}`)}
    ${row('Fee share due', esc(money(invoice.amount, cur)))}
    ${row('Paid to date', esc(money(invoice.paid_total, cur)))}
    ${row('Balance', esc(money(invoice.balance, cur)))}
    ${receipt.received_by ? row('Received by', esc(receipt.received_by)) : ''}
    ${receipt.note ? row('Note', esc(receipt.note)) : ''}
  </table>
  <div class="sig"><div>Received by (signature)</div><div>Payer (signature)</div></div>
  <div class="foot">Keep this receipt as proof of payment.${site.support_email || site.support_phone ? ` Questions: ${esc([site.support_email, site.support_phone].filter(Boolean).join(' · '))}` : ''}</div>
</div><p class="noprint" style="text-align:center"><button onclick="window.print()">Print</button></p></body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 350)
}
