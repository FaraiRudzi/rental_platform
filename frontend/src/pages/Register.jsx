import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import AuthShell from '../components/AuthShell'
import { Alert, Field } from '../components/ui'
import { home, safeNext } from '../nav'

const Icon = ({ children }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

const ROLES = {
  tenant: {
    label: 'Tenant',
    heading: 'Create your tenant account',
    sub: 'Free to join. Apply for homes and track every application.',
    consent: 'I understand that when a home is confirmed, a placement fee is shared between the landlord and me, and I will see my share before I confirm.',
  },
  landlord: {
    label: 'Landlord',
    heading: 'Create your landlord account',
    sub: 'Free to list. List your homes and manage applicants. Keep your ID and proof of ownership ready for verification.',
    consent: 'I understand that when a tenant is confirmed, a placement fee is shared between the tenant and me, and I will see my share before I confirm.',
  },
}

export default function Register() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const next = safeNext(sp.get('next'))
  const role = ROLES[sp.get('role')] ? sp.get('role') : null
  const [step, setStep] = useState('form') // form | code
  const [f, setF] = useState({ full_name: '', phone: '', email: '', password: '', confirm: '', code: '', whatsapp: true, agree: false })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const loginLink = `/login${next ? `?next=${encodeURIComponent(next)}` : ''}`

  const pickRole = (r) => { const p = new URLSearchParams(sp); if (r) p.set('role', r); else p.delete('role'); setSp(p, { replace: true }) }
  const details = () => ({ phone: f.phone, full_name: f.full_name, role, email: f.email, password: f.password })

  const run = async (fn) => {
    setBusy(true); setError(''); setInfo('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const start = (e) => {
    e.preventDefault()
    if (f.password && f.password !== f.confirm) { setError('The two passwords do not match.'); return }
    if (!f.agree) { setError('Please tick the box to confirm you understand how fees work.'); return }
    run(async () => { await api('/auth/register/start/', { method: 'POST', body: details() }); setStep('code') })
  }
  const resend = () => run(async () => { await api('/auth/register/start/', { method: 'POST', body: details() }); setInfo('A new code is on its way.') })
  const verify = (e) => {
    e.preventDefault()
    run(async () => {
      const data = await api('/auth/otp/verify/', { method: 'POST', body: { ...details(), code: f.code, whatsapp_opt_in: f.whatsapp } })
      login(data); nav(next || home(data.user.role))
    })
  }

  // ---- step 0: who are you?
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
      <span className="role-pill">{c.label} sign-up{step === 'form' && <button type="button" className="link" onClick={() => pickRole(null)}>change</button>}</span>
      <h1>{step === 'form' ? c.heading : 'Verify your phone'}</h1>
      <p className="muted">{step === 'form' ? c.sub : `We sent a 6-digit code to ${f.phone}. Enter it to finish creating your account.`}</p>
      <div className="steps" aria-hidden="true"><i className="on" /><i className={step === 'code' ? 'on' : ''} /></div>
      <Alert error={error} ok={info} />

      {step === 'form' ? (
        <form onSubmit={start} className="stack">
          <Field label="Full name"><input value={f.full_name} onChange={set('full_name')} autoComplete="name" required minLength={2} /></Field>
          <div className="two">
            <Field label="Phone number" hint="We text a code to this number. Use international format.">
              <input value={f.phone} onChange={set('phone')} placeholder="+263771234567" inputMode="tel" autoComplete="tel" required />
            </Field>
            <Field label="Email (optional)"><input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
          </div>
          <div className="two">
            <Field label="Password (optional)" hint="At least 8 characters. Or skip it and log in with a text code."><input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} /></Field>
            <Field label="Confirm password"><input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
          </div>
          <label className="consent"><input type="checkbox" checked={f.whatsapp} onChange={set('whatsapp')} /> <span>Send me alerts on WhatsApp as well as in the app and by SMS.</span></label>
          <label className="consent"><input type="checkbox" checked={f.agree} onChange={set('agree')} /> <span>{c.consent}</span></label>
          <button className="btn block" disabled={busy}>{busy ? 'Sending code…' : 'Send me a code'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="stack">
          <Field label="6-digit code"><input value={f.code} onChange={set('code')} inputMode="numeric" maxLength={6} autoComplete="one-time-code" required autoFocus /></Field>
          <button className="btn block" disabled={busy}>{busy ? 'Creating account…' : 'Verify and create my account'}</button>
          <div className="row between">
            <button type="button" className="link small" onClick={resend} disabled={busy}>Send a new code</button>
            <button type="button" className="link small" onClick={() => { setStep('form'); setError(''); setInfo('') }}>Edit my details</button>
          </div>
        </form>
      )}

      <div className="auth-foot">
        <span className="muted">Already have an account? <Link to={loginLink}><strong>Log in</strong></Link></span>
        <Link to="/">← Back to homes</Link>
      </div>
    </AuthShell>
  )
}
