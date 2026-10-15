'use client'
import { useState } from 'react'
import AuthShell from '@/components/AuthShell'
import Link from '@/components/Link'
import PasswordInput from '@/components/PasswordInput'
import { Alert, Field } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { home } from '@/lib/nav'
import { useNavigate, useSearchParams } from '@/lib/nav-hooks'

export default function ResetPassword() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [f, setF] = useState({ password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const uid = sp.get('uid')
  const token = sp.get('token')

  const submit = async (e) => {
    e.preventDefault()
    if (f.password !== f.confirm) { setError('The two passwords do not match.'); return }
    setBusy(true); setError('')
    try {
      const data = await api('/auth/reset/', { method: 'POST', body: { uid, token, password: f.password } })
      login(data)
      nav(home(data.user.role))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <AuthShell>
      <h1>Choose a new password</h1>
      {!uid || !token ? (
        <>
          <Alert error="This reset link is incomplete. Please use the link from your email, or request a new one." />
          <div className="auth-foot"><Link to="/forgot-password">Request a new link</Link></div>
        </>
      ) : (
        <>
          <p className="muted">Pick a password you have not used elsewhere. At least 8 characters.</p>
          <Alert error={error} />
          <form onSubmit={submit} className="stack">
            <Field label="New password"><PasswordInput value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" minLength={8} required autoFocus /></Field>
            <Field label="Confirm new password"><PasswordInput value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" required /></Field>
            <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Save password and log in'}</button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
