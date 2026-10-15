'use client'
import { useState } from 'react'
import AuthShell from '@/components/AuthShell'
import Link from '@/components/Link'
import { Alert, Field } from '@/components/ui'
import { api } from '@/lib/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { const d = await api('/auth/forgot/', { method: 'POST', body: { email } }); setDone(d.detail) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <AuthShell>
      <h1>Forgot your password?</h1>
      <p className="muted">Enter the email address on your account and we will send you a link to choose a new password.</p>
      <Alert error={error} ok={done} />
      {!done && (
        <form onSubmit={submit} className="stack">
          <Field label="Email address"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus /></Field>
          <button className="btn block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <p className="muted small">Signed up with Google or Facebook and never set a password? Use this too, to create one. Not getting emails? Ask the site administrator to set a password for you.</p>
      <div className="auth-foot"><Link to="/login">← Back to log in</Link></div>
    </AuthShell>
  )
}
