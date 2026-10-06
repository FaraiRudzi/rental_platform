import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert, Field } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const initialRole = searchParams.get('role') === 'landlord' ? 'landlord' : 'tenant'
  const adminMode = searchParams.get('mode') === 'admin'
  const [step, setStep] = useState('phone') // phone | code
  const [f, setF] = useState({ phone: '', code: '', full_name: '', role: initialRole })
  const [needsReg, setNeedsReg] = useState(false)
  const [usePassword, setUsePassword] = useState(adminMode)
  const [developmentCode, setDevelopmentCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const go = async (fn) => { setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message); if (e.data?.needs_registration) setNeedsReg(true) } finally { setBusy(false) } }

  const requestCode = (e) => {
    e.preventDefault()
    go(async () => {
      const response = await api('/auth/otp/request/', { method: 'POST', body: { phone: f.phone } })
      setDevelopmentCode(response.development_code || '')
      setStep('code')
    })
  }
  const verify = (e) => {
    e.preventDefault()
    go(async () => {
      const body = { phone: f.phone, code: f.code }
      if (needsReg) { body.full_name = f.full_name; body.role = f.role }
      const data = await api('/auth/otp/verify/', { method: 'POST', body })
      login(data)
      nav(data.user.role === 'landlord' ? '/landlord' : data.user.role === 'admin' ? '/admin' : '/')
    })
  }
  const passwordLogin = (e) => {
    e.preventDefault()
    go(async () => { const data = await api('/auth/login/', { method: 'POST', body: { phone: f.phone, password } }); login(data); nav(data.user.role === 'admin' ? '/admin' : '/') })
  }

  return (
    <div className="auth-layout">
      <div className="card narrow auth-card">
        <div className="auth-heading">
          <p className="eyebrow">{usePassword ? 'Restricted access' : initialRole === 'landlord' ? 'A home for every good home' : 'Tenant & landlord access'}</p>
          <h1>{usePassword ? 'Administrator sign in' : initialRole === 'landlord' ? 'List your property' : 'Find your place'}</h1>
          {usePassword
            ? <p className="muted">Administrator accounts are created by the site operator in Django. Sign in with your admin phone number and password.</p>
            : initialRole === 'landlord'
              ? <p className="muted">Enter your phone number to sign in or create a landlord account, then add your property.</p>
              : <p className="muted">Sign in or create a tenant or landlord account using your phone number and a verification code.</p>}
        </div>
        <Alert error={error} />
        {usePassword ? (
          <form onSubmit={passwordLogin} className="stack">
            <Field label="Phone number"><input value={f.phone} onChange={set('phone')} placeholder="+263771234567" required /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <button className="btn" disabled={busy}>Log in</button>
          </form>
        ) : step === 'phone' ? (
          <form onSubmit={requestCode} className="stack">
            <Field label="Phone number" hint="International format. We will text you a code."><input value={f.phone} onChange={set('phone')} placeholder="+263771234567" required /></Field>
            <button className="btn" disabled={busy}>Send code</button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <p className="muted">Code sent to {f.phone}.</p>
            {developmentCode && (
              <div className="note" role="status">
                SMS delivery is not configured in development. Enter this temporary code:
                <strong className="development-code"> {developmentCode}</strong>
              </div>
            )}
            <Field label="6-digit code"><input value={f.code} onChange={set('code')} inputMode="numeric" maxLength={6} required /></Field>
            {needsReg && (
              <>
                <p>It looks like you are new here. Tell us a little about you:</p>
                <Field label="Full name"><input value={f.full_name} onChange={set('full_name')} required /></Field>
                <Field label="I am a">
                  <select className="form-select" value={f.role} onChange={set('role')}>
                    <option value="tenant">Tenant (looking for a home)</option>
                    <option value="landlord">Landlord (I have a home to let)</option>
                  </select>
                </Field>
              </>
            )}
            <button className="btn" disabled={busy}>Continue</button>
            <button type="button" className="link" onClick={() => { setStep('phone'); setNeedsReg(false) }}>Use a different number</button>
          </form>
        )}
        <button className="link small login-mode-toggle" onClick={() => setUsePassword(!usePassword)}>
          {usePassword ? 'Tenant or landlord? Continue with phone verification' : 'Administrator? Sign in with password'}
        </button>
      </div>
    </div>
  )
}
