import Icon from './Icons'

export function Badge({ status }) {
  const tone = {
    published: 'ok', verified: 'ok', paid: 'ok', active: 'ok', confirmed: 'ok', approved: 'ok', accepted: 'info',
    submitted: 'info', under_review: 'info', pending_review: 'info', awaiting_payment: 'warn', part_paid: 'warn',
    unpaid: 'warn', pending: 'warn', draft: 'muted', reserved: 'warn', let: 'muted', archived: 'muted',
    received: 'ok', reversed: 'bad', waived: 'info', 'not started': 'warn', rejected: 'bad', declined: 'bad', cancelled: 'bad', expired: 'bad', void: 'bad', withdrawn: 'warn', refunded: 'muted',
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

export function Field({ label, children, hint, error }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      {children}
      {error ? <small className="field-error" role="alert">{error}</small> : hint && <small className="muted">{hint}</small>}
    </label>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="row gap wrap">{children}</div>}
    </div>
  )
}

// A summary number with an icon, for dashboards. Pass onClick to make it a button.
export function StatTile({ icon, label, value, tone = 'blue', onClick }) {
  const body = (
    <>
      <span className="t-ico"><Icon name={icon} size={20} /></span>
      <span><span className="t-val">{value}</span><span className="t-lbl">{label}</span></span>
    </>
  )
  return onClick
    ? <button type="button" className={`tile ${tone}`} onClick={onClick}>{body}</button>
    : <div className={`tile ${tone}`}>{body}</div>
}

export function Avatar({ name = '?', size = 38 }) {
  return <span className="avatar-sm" style={{ width: size, height: size, fontSize: size * 0.42 }}>{name.trim()[0]?.toUpperCase() || '?'}</span>
}

// Progress through a list of steps (current is the 0-based index of the step you are on).
export function Stepper({ steps, current }) {
  return (
    <ol className="stepper">
      {steps.map((label, i) => (
        <li key={label} className={i < current ? 'done' : i === current ? 'now' : ''}>
          <span className="st-dot">{i < current ? <Icon name="check" size={12} /> : i + 1}</span>
          <span className="st-lbl">{label}</span>
        </li>
      ))}
    </ol>
  )
}

export function EmptyState({ icon = 'info', title, children }) {
  return (
    <div className="empty-state">
      <span className="es-ico"><Icon name={icon} size={26} /></span>
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  )
}
