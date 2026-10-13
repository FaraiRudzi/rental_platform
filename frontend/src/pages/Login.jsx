import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import AuthShell from '../components/AuthShell'
import { Alert, Field } from '../components/ui'
import { home, safeNext } from '../nav'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const next = safeNext(sp.get('next'))
  const [step, setStep] = useState('phone') // phone | code
  const [f, setF] = useState({ phone: '', code: '' })
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [noAccount, setNoAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const registerLink = `/register${next ? `?next=${encodeURIComponent(next)}` : ''}`

  const go = async (fn) => {
    setBusy(true); setError(''); setNoAccount(false)
    try { await fn() } catch (e) { setError(e.message); if (e.data?.needs_registration) setNoAccount(true) } finally { setBusy(false) }
  }
  const finish = (data) => { login(data); nav(next || home(data.user.role)) }
  const requestCode = (e) => { e.preventDefault(); go(async () => { await api('/auth/otp/request/', { method: 'POST', body: { phone: f.phone } }); setStep('code') }) }
  const verify = (e) => { e.preventDefault(); go(async () => finish(await api('/auth/otp/verify/', { method: 'POST', body: { phone: f.phone, code: f.code } }))) }
  const passwordLogin = (e) => { e.preventDefault(); go(async () => finish(await api('/auth/login/', { method: 'POST', body: { phone: f.phone, password } }))) }

  const title = usePassword ? 'Log in with password' : step === 'phone' ? 'Welcome back' : 'Enter your code'
  const subtitle = usePassword ? 'Use the password set for your account.'
    : step === 'phone' ? 'Log in with your phone number. We will text you a code.' : `We sent a 6-digit code to ${f.phone}.`

  return (
    <AuthShell>
      <h1>{title}</h1>
      <p className="muted">{subtitle}</p>
      {!usePassword && <div className="steps" aria-hidden="true"><i className="on" /><i className={step === 'code' ? 'on' : ''} /></div>}
      <Alert error={error} />
      {noAccount && <Link className="btn ghost block" to={registerLink}>Create a free account</Link>}

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
          <button className="btn block" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
          <button type="button" className="link small" onClick={() => { setStep('phone'); setError(''); setNoAccount(false) }}>Use a different number</button>
        </form>
      )}

      <div className="auth-foot">
        <button className="link" onClick={() => { setUsePassword(!usePassword); setError(''); setNoAccount(false) }}>{usePassword ? 'Use a text code instead' : 'Log in with a password'}</button>
        <Link to="/">← Back to homes</Link>
      </div>
      <div className="auth-switch">New here? <Link to={registerLink}><strong>Create a free account</strong></Link></div>
    </AuthShell>
  )
}
