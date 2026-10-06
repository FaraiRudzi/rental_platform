export function Badge({ status }) {
  const tone = {
    published: 'ok', verified: 'ok', paid: 'ok', active: 'ok', confirmed: 'ok', approved: 'ok', accepted: 'info',
    submitted: 'info', under_review: 'info', pending_review: 'info', awaiting_payment: 'warn', part_paid: 'warn',
    unpaid: 'warn', pending: 'warn', draft: 'muted', reserved: 'warn', let: 'muted', archived: 'muted',
    rejected: 'bad', declined: 'bad', cancelled: 'bad', expired: 'bad', void: 'bad', withdrawn: 'muted', refunded: 'muted',
  }[status] || 'muted'
  return <span className={`badge ${tone}`}>{String(status).replace(/_/g, ' ')}</span>
}

export function Alert({ error, ok }) {
  if (error) return <div className="alert bad" role="alert">{error}</div>
  if (ok) return <div className="alert ok">{ok}</div>
  return null
}

export function Empty({ children }) {
  return <p className="muted empty">{children}</p>
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}
