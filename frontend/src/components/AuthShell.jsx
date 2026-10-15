'use client'
import { useSite } from '@/lib/site'

// Shared frame for the login and sign-up pages: illustrated brand panel + white card.
const VARIANTS = {
  default: {
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
  const site = useSite()
  const v = VARIANTS[variant] || VARIANTS.default
  const headline = v.headline || `${site.tagline.replace(/\.$/, '')}.`
  const style = site.login_background_url ? { '--auth-bg': `url(${site.login_background_url})` } : undefined
  return (
    <div className="auth-page">
      <aside className="auth-brand" style={style}>
        <img className="auth-brand-logo" src={site.logo_white_url || '/logo-white.png'} alt={site.company_name} />
        <div>
          <h2>{headline}</h2>
          <p>{v.blurb}</p>
          <ul className="auth-points">
            {v.points.map((p) => <li key={p}><span>✓</span> {p}</li>)}
          </ul>
        </div>
        <small>© {new Date().getFullYear()} {site.company_name}{site.footer_text ? ` · ${site.footer_text}` : ''}</small>
      </aside>
      <section className="auth-panel">
        <div className={`auth-card ${wide ? 'wide' : ''}`}>
          <img className="auth-logo" src={site.logo_url || '/logo.png'} alt={site.company_name} />
          {children}
        </div>
      </section>
    </div>
  )
}
