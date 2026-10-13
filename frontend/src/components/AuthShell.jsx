// Shared frame for the login and sign-up pages: illustrated brand panel + white card.
const VARIANTS = {
  default: {
    headline: 'Find a home you can trust.',
    blurb: 'Verified landlords, transparent fees and instant updates, all in one place.',
    points: ['Verified landlords and checked listings', 'Alerts by app, WhatsApp and SMS', 'Clear, shared placement fees with no surprises'],
  },
  tenant: {
    headline: 'Your next home starts here.',
    blurb: 'Create a free account to apply, save searches and get instant updates.',
    points: ['Apply to homes in minutes', 'Alerts by app, WhatsApp and SMS', 'See your fee share before you confirm'],
  },
  landlord: {
    headline: 'List your home. Meet reliable tenants.',
    blurb: 'Reach people looking for a home and manage every application in one place.',
    points: ['Free to list and review applicants', 'A verified-landlord badge builds trust', 'A fee is only due once a tenant is confirmed'],
  },
}

export default function AuthShell({ variant = 'default', wide = false, children }) {
  const v = VARIANTS[variant] || VARIANTS.default
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <img className="auth-brand-logo" src="/logo-white.png" alt="NexaSoft Technologies" />
        <div>
          <h2>{v.headline}</h2>
          <p>{v.blurb}</p>
          <ul className="auth-points">
            {v.points.map((p) => <li key={p}><span>✓</span> {p}</li>)}
          </ul>
        </div>
        <small>© {new Date().getFullYear()} NexaSoft Technologies · Innovation through technology</small>
      </aside>
      <section className="auth-panel">
        <div className={`auth-card ${wide ? 'wide' : ''}`}>
          <img className="auth-logo" src="/logo.png" alt="NexaSoft Technologies" />
          {children}
        </div>
      </section>
    </div>
  )
}
