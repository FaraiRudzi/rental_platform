'use client'
import { useState } from 'react'
import AuthShell from '@/components/AuthShell'
import Link from '@/components/Link'
import PasswordInput from '@/components/PasswordInput'
import SocialButtons from '@/components/SocialButtons'
import { Alert, Field } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { home, safeNext } from '@/lib/nav'
import { useNavigate, useSearchParams } from '@/lib/nav-hooks'
import { ROLES } from '@/lib/roles'
import { useSite } from '@/lib/site'

const Icon = ({ children }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export default function Register() {
  const { login } = useAuth()
  const site = useSite()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const next = safeNext(sp.get('next'))
  const role = ROLES[sp.get('role')] ? sp.get('role') : null
  const [f, setF] = useState({ full_name: '', phone: '', email: '', password: '', confirm: '', whatsapp: true, agree: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const loginLink = `/login${next ? `?next=${encodeURIComponent(next)}` : ''}`
  const pickRole = (r) => { const p = new URLSearchParams(sp); if (r) p.set('role', r); else p.delete('role'); setSp(p, { replace: true }) }

  if (!site.registration_open) {
    return (
      <AuthShell>
        <h1>Sign-ups are closed</h1>
        <p className="muted">New accounts are not being accepted right now. Please check back soon.</p>
        <div className="auth-foot"><Link to={loginLink}>Log in</Link><Link to="/">← Back to homes</Link></div>
      </AuthShell>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (f.password !== f.confirm) { setError('The two passwords do not match.'); return }
    if (!f.agree) { setError('Please tick the box to confirm you understand how fees work.'); return }
    setBusy(true); setError('')
    try {
      const data = await api('/auth/register/', { method: 'POST', body: { full_name: f.full_name, phone: f.phone, email: f.email, password: f.password, role, whatsapp_opt_in: f.whatsapp } })
      login(data)
      // new landlords go straight to document upload; everyone else to where they were heading
      nav(next || (data.user.role === 'landlord' ? '/verification?welcome=1' : home(data.user.role)))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!role) {
    return (
      <AuthShell>
        <h1>Create your free account</h1>
        <p className="muted">Browsing is free. To apply for a home or list one, you need an account. Which describes you?</p>
        <div className="role-cards">
          <button type="button" className="role-card" onClick={() => pickRole('tenant')}>
            <span className="role-icon"><Icon><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon></span>
            <span><strong>I am looking for a home</strong><small className="muted">Search, apply and get alerts as a tenant.</small></span>
          </button>
          <button type="button" className="role-card" onClick={() => pickRole('landlord')}>
            <span className="role-icon"><Icon><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></Icon></span>
            <span><strong>I have a home to let</strong><small className="muted">List your property and manage applicants as a landlord.</small></span>
          </button>
        </div>
        <div className="auth-foot">
          <span className="muted">Already have an account? <Link to={loginLink}><strong>Log in</strong></Link></span>
          <Link to="/">← Back to homes</Link>
        </div>
      </AuthShell>
    )
  }

  const c = ROLES[role]
  return (
    <AuthShell variant={role} wide>
      <span className="role-pill">{c.label} sign-up<button type="button" className="link" onClick={() => pickRole(null)}>change</button></span>
      <h1>{c.heading}</h1>
      <p className="muted">{c.sub}</p>
      <SocialButtons role={role} next={next} label="Sign up" />
      <Alert error={error} />
      <form onSubmit={submit} className="stack">
        <Field label="Full name"><input value={f.full_name} onChange={set('full_name')} autoComplete="name" required minLength={2} /></Field>
        <div className="two">
          <Field label="Phone number" hint="International format, for example +263771234567">
            <input value={f.phone} onChange={set('phone')} placeholder="+263771234567" inputMode="tel" autoComplete="tel" required />
          </Field>
          <Field label="Email address" hint="You can log in with it, and use it to reset your password.">
            <input type="email" value={f.email} onChange={set('email')} autoComplete="email" required />
          </Field>
        </div>
        <div className="two">
          <Field label="Password" hint="At least 8 characters. Avoid common passwords."><PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} required /></Field>
          <Field label="Confirm password"><PasswordInput value={f.confirm} onChange={set('confirm')} autoComplete="new-password" required /></Field>
        </div>
        <label className="consent"><input type="checkbox" checked={f.whatsapp} onChange={set('whatsapp')} /> <span>Send me alerts on WhatsApp as well as in the app.</span></label>
        <label className="consent"><input type="checkbox" checked={f.agree} onChange={set('agree')} /> <span>{c.consent}</span></label>
        <button className="btn block" disabled={busy}>{busy ? 'Creating account…' : 'Create my account'}</button>
      </form>
      <div className="auth-foot">
        <span className="muted">Already have an account? <Link to={loginLink}><strong>Log in</strong></Link></span>
        <Link to="/">← Back to homes</Link>
      </div>
    </AuthShell>
  )
}
