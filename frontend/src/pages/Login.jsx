import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert, Field } from '../components/ui'

const home = (role) => (role === 'landlord' ? '/landlord' : role === 'admin' ? '/admin' : '/')

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [step, setStep] = useState('phone') // phone | code
  const [f, setF] = useState({ phone: '', code: '', full_name: '', role: 'tenant' })
  const [needsReg, setNeedsReg] = useState(false)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const go = async (fn) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(e.message); if (e.data?.needs_registration) setNeedsReg(true) } finally { setBusy(false) }
  }
  const requestCode = (e) => { e.preventDefault(); go(async () => { await api('/auth/otp/request/', { method: 'POST', body: { phone: f.phone } }); setStep('code') }) }
  const verify = (e) => {
    e.preventDefault()
    go(async () => {
      const body = { phone: f.phone, code: f.code }
      if (needsReg) { body.full_name = f.full_name; body.role = f.role }
      const data = await api('/auth/otp/verify/', { method: 'POST', body })
      login(data); nav(home(data.user.role))
    })
  }
  const passwordLogin = (e) => {
    e.preventDefault()
    go(async () => { const data = await api('/auth/login/', { method: 'POST', body: { phone: f.phone, password } }); login(data); nav(home(data.user.role)) })
  }

  const title = usePassword ? 'Log in with password' : step === 'phone' ? 'Welcome' : needsReg ? 'Create your account' : 'Enter your code'
  const subtitle = usePassword ? 'Use the password set for your account.'
    : step === 'phone' ? 'Log in or sign up with your phone number. We will text you a code.'
      : needsReg ? 'You are new here. Tell us a little about you.' : `We sent a 6-digit code to ${f.phone}.`

  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <img className="auth-brand-logo" src="/logo-white.png" alt="NexaSoft Technologies" />
        <div>
          <h2>Find a home you can trust.</h2>
          <p>Verified landlords, transparent fees and instant updates, all in one place.</p>
          <ul className="auth-points">
            <li><span>✓</span> Verified landlords and checked listings</li>
            <li><span>✓</span> Alerts by app, WhatsApp and SMS</li>
            <li><span>✓</span> Clear, shared placement fees with no surprises</li>
          </ul>
        </div>
        <small>© {new Date().getFullYear()} NexaSoft Technologies · Innovation through technology</small>
      </aside>

      <section className="auth-panel">
        <div className="auth-card">
          <img className="auth-logo" src="/logo.png" alt="NexaSoft Technologies" />
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
          {!usePassword && <div className="steps" aria-hidden="true"><i className="on" /><i className={step === 'code' ? 'on' : ''} /></div>}
          <Alert error={error} />

          {usePassword ? (
            <form onSubmit={passwordLogin} className="stack">
              <Field label="Phone number"><input value={f.phone} onChange={set('phone')} placeholder="+263771234567" autoComplete="username" required /></Field>
              <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
              <button className="btn block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
            </form>
          ) : step === 'phone' ? (
            <form onSubmit={requestCode} className="stack">
              <Field label="Phone number" hint="International format, for example +263771234567">
                <input value={f.phone} onChange={set('phone')} placeholder="+263771234567" inputMode="tel" autoComplete="tel" required />
              </Field>
              <button className="btn block" disabled={busy}>{busy ? 'Sending…' : 'Send me a code'}</button>
            </form>
          ) : (
            <form onSubmit={verify} className="stack">
              <Field label="6-digit code"><input value={f.code} onChange={set('code')} inputMode="numeric" maxLength={6} autoComplete="one-time-code" required autoFocus /></Field>
              {needsReg && (
                <>
                  <Field label="Full name"><input value={f.full_name} onChange={set('full_name')} required /></Field>
                  <Field label="I am a">
                    <select value={f.role} onChange={set('role')}>
                      <option value="tenant">Tenant, looking for a home</option>
                      <option value="landlord">Landlord, I have a home to let</option>
                    </select>
                  </Field>
                </>
              )}
              <button className="btn block" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
              <button type="button" className="link small" onClick={() => { setStep('phone'); setNeedsReg(false); setError('') }}>Use a different number</button>
            </form>
          )}

          <div className="auth-foot">
            <button className="link" onClick={() => { setUsePassword(!usePassword); setError('') }}>{usePassword ? 'Use a text code instead' : 'Have a password? Log in with it'}</button>
            <Link to="/">← Back to homes</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
