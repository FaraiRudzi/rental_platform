'use client'
import { useState } from 'react'
import PasswordInput from '@/components/PasswordInput'
import { Alert, Field, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export default function Account() {
  const { user, setUser, refreshUser } = useAuth()
  const [p, setP] = useState({ full_name: user.full_name, email: user.email || '', whatsapp_opt_in: !!user.whatsapp_opt_in })
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [profileMsg, setProfileMsg] = useState({})
  const [pwMsg, setPwMsg] = useState({})
  const [busy, setBusy] = useState('')

  const saveProfile = async (e) => {
    e.preventDefault()
    setBusy('profile'); setProfileMsg({})
    try {
      const updated = await api('/me/', { method: 'PATCH', body: p })
      setUser(updated)
      setProfileMsg({ ok: 'Saved.' })
    } catch (err) { setProfileMsg({ error: err.message }) } finally { setBusy('') }
  }
  const savePassword = async (e) => {
    e.preventDefault()
    if (pw.next !== pw.confirm) { setPwMsg({ error: 'The two new passwords do not match.' }); return }
    setBusy('password'); setPwMsg({})
    try {
      await api('/me/password/', { method: 'POST', body: { current_password: pw.current, new_password: pw.next } })
      setPw({ current: '', next: '', confirm: '' })
      setPwMsg({ ok: 'Password updated.' })
      refreshUser()
    } catch (err) { setPwMsg({ error: err.message }) } finally { setBusy('') }
  }

  return (
    <div className="stack">
      <PageHeader title="My account" subtitle="Your details and password." />
      <form className="card stack" onSubmit={saveProfile}>
        <h3>Your details</h3>
        <Alert error={profileMsg.error} ok={profileMsg.ok} />
        <div className="two">
          <Field label="Full name"><input value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} required minLength={2} /></Field>
          <Field label="Email address" hint="You can log in with it."><input type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} required={user.role !== 'admin'} /></Field>
        </div>
        <Field label="Phone number" hint="Your phone number identifies your account, so it cannot be changed here. Contact support to change it."><input value={user.phone} disabled /></Field>
        <label className="consent"><input type="checkbox" checked={p.whatsapp_opt_in} onChange={(e) => setP({ ...p, whatsapp_opt_in: e.target.checked })} /> <span>Send me alerts on WhatsApp.</span></label>
        <div><button className="btn" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save details'}</button></div>
      </form>

      <form className="card stack" onSubmit={savePassword}>
        <h3>{user.has_password ? 'Change password' : 'Set a password'}</h3>
        {!user.has_password && <p className="muted small">You signed in with Google or Facebook. Set a password if you also want to log in with your email or phone number.</p>}
        <Alert error={pwMsg.error} ok={pwMsg.ok} />
        {user.has_password && <Field label="Current password"><PasswordInput value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required /></Field>}
        <div className="two">
          <Field label="New password" hint="At least 8 characters."><PasswordInput value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" minLength={8} required /></Field>
          <Field label="Confirm new password"><PasswordInput value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" required /></Field>
        </div>
        <div><button className="btn" disabled={busy === 'password'}>{busy === 'password' ? 'Saving…' : 'Update password'}</button></div>
      </form>
    </div>
  )
}
