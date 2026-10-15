'use client'
import { useEffect, useState } from 'react'
import AuthShell from '@/components/AuthShell'
import Link from '@/components/Link'
import { Alert, Field } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { home, safeNext } from '@/lib/nav'
import { useNavigate, useSearchParams } from '@/lib/nav-hooks'
import { ROLES } from '@/lib/roles'

// Second step for someone signing up with Google or Facebook: we need a phone number and their role.
export default function SocialComplete() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const next = safeNext(sp.get('next'))
  const [info, setInfo] = useState(null)
  const [f, setF] = useState({ role: '', phone: '', whatsapp: true, agree: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('rp_social')
    if (!raw) { nav('/login', { replace: true }); return }
    const d = JSON.parse(raw)
    setInfo(d)
    setF((x) => ({ ...x, role: ROLES[d.role] ? d.role : '' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!info) return <AuthShell><p className="muted">Loading…</p></AuthShell>

  const submit = async (e) => {
    e.preventDefault()
    if (!f.role) { setError('Choose whether you are a tenant or a landlord.'); return }
    if (!f.agree) { setError('Please tick the box to confirm you understand how fees work.'); return }
    setBusy(true); setError('')
    try {
      const data = await api('/auth/social/complete/', { method: 'POST', body: { signup_token: info.signup_token, role: f.role, phone: f.phone, whatsapp_opt_in: f.whatsapp, full_name: info.name } })
      sessionStorage.removeItem('rp_social')
      login(data)
      nav(next || (data.user.role === 'landlord' ? '/verification?welcome=1' : home(data.user.role)))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const c = ROLES[f.role]
  return (
    <AuthShell variant={f.role || 'default'} wide>
      <h1>Almost there{info.name ? `, ${info.name.split(' ')[0]}` : ''}</h1>
      <p className="muted">You signed in with {info.provider === 'google' ? 'Google' : 'Facebook'} as <strong>{info.email}</strong>. We just need two more things.</p>
      <Alert error={error} />
      <form onSubmit={submit} className="stack">
        <div className="role-cards">
          {Object.entries(ROLES).map(([key, r]) => (
            <button type="button" key={key} className={`role-card ${f.role === key ? 'on' : ''}`} onClick={() => setF({ ...f, role: key })}>
              <span><strong>{key === 'tenant' ? 'I am looking for a home' : 'I have a home to let'}</strong><small className="muted">{r.label} account</small></span>
            </button>
          ))}
        </div>
        <Field label="Phone number" hint="International format, for example +263771234567. Used for alerts about your applications.">
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+263771234567" inputMode="tel" autoComplete="tel" required />
        </Field>
        <label className="consent"><input type="checkbox" checked={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.checked })} /> <span>Send me alerts on WhatsApp as well as in the app.</span></label>
        <label className="consent"><input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} /> <span>{c ? c.consent : 'I understand that a placement fee is shared between landlord and tenant once a home is confirmed, and I will see my share before I confirm.'}</span></label>
        <button className="btn block" disabled={busy}>{busy ? 'Creating account…' : 'Create my account'}</button>
      </form>
      <div className="auth-foot"><Link to="/login">Cancel</Link></div>
    </AuthShell>
  )
}
