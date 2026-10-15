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
import { useSite } from '@/lib/site'

export default function Login() {
  const { login } = useAuth()
  const site = useSite()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const next = safeNext(sp.get('next'))
  const [f, setF] = useState({ identifier: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const query = next ? `?next=${encodeURIComponent(next)}` : ''

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const data = await api('/auth/login/', { method: 'POST', body: f })
      login(data)
      nav(next || home(data.user.role))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <AuthShell>
      <h1>Welcome back</h1>
      <p className="muted">Log in with your email or phone number and your password.</p>
      <SocialButtons next={next} />
      <Alert error={error} />
      <form onSubmit={submit} className="stack">
        <Field label="Email or phone number" hint="Phone numbers in international format, for example +263771234567">
          <input value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} autoComplete="username" required autoFocus />
        </Field>
        <Field label="Password">
          <PasswordInput value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" required />
        </Field>
        <div className="row between"><span /><Link to="/forgot-password" className="small">Forgot your password?</Link></div>
        <button className="btn block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <div className="auth-foot"><span /><Link to="/">← Back to homes</Link></div>
      {site.registration_open && <div className="auth-switch">New here? <Link to={`/register${query}`}><strong>Create a free account</strong></Link></div>}
    </AuthShell>
  )
}
