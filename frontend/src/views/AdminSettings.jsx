'use client'
import { useEffect, useRef, useState } from 'react'
import { Alert, Field, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { useSite } from '@/lib/site'

const IMAGES = [
  { key: 'logo', title: 'Logo', bg: 'light', fallback: '/logo.png',
    help: 'Shown in the header. Use a transparent PNG, or a JPG on a white background (the white is removed automatically).' },
  { key: 'logo_white', title: 'Logo for dark backgrounds', bg: 'dark', fallback: '/logo-white.png',
    help: 'Shown on the login and sign-up panel. Leave it unset to create it automatically from your logo.' },
  { key: 'logo_icon', title: 'Icon', bg: 'checker', fallback: '/logo-mark.png',
    help: 'A square mark. Used on phones, in the footer and as the browser tab icon.' },
  { key: 'login_background', title: 'Login background', bg: 'dark cover', fallback: '/login-bg.jpg',
    help: 'The picture on the left of the login and sign-up pages. Portrait, about 1200 x 1500, darker at the top so the white text stays readable.' },
]

const TEXTS = [
  ['site_name', 'Site name', 'Used in page titles and emails.'],
  ['tagline', 'Tagline', 'Shown on the login page.'],
  ['company_name', 'Company name', 'Shown in the footer.'],
  ['footer_text', 'Footer line', 'Shown after the company name.'],
  ['hero_title', 'Search page headline', 'The big heading on the home page.'],
  ['hero_subtitle', 'Search page subtitle', 'The line under the headline.'],
  ['support_email', 'Support email', 'Shown in the footer (optional).'],
  ['support_phone', 'Support phone', 'Shown in the footer (optional).'],
]

const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v)

function ColorField({ label, value, onChange, fallback }) {
  return (
    <Field label={label}>
      <div className="color-row">
        <input type="color" value={isHex(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} />
        <button type="button" className="link small" onClick={() => onChange(fallback)}>Reset</button>
      </div>
    </Field>
  )
}

function ImageCard({ item, url, busy, onUpload, onRemove }) {
  const input = useRef(null)
  return (
    <div className="card img-card">
      <h3>{item.title}</h3>
      <p className="muted small">{item.help}</p>
      <div className={`preview ${item.bg}`}><img src={url || item.fallback} alt={item.title} /></div>
      <div className="row gap wrap">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
          onChange={(e) => { const file = e.target.files[0]; if (file) onUpload(item.key, file); e.target.value = '' }} />
        <button className="btn ghost" disabled={busy} onClick={() => input.current.click()}>{busy ? 'Working…' : 'Upload new'}</button>
        {url && <button className="btn danger" disabled={busy} onClick={() => onRemove(item.key)}>Reset to default</button>}
      </div>
    </div>
  )
}

export default function AdminSettings() {
  const site = useSite()
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    api('/admin/settings/').then((d) => { setData(d); setForm(d.values) }).catch((e) => setError(e.message))
  }, [])

  if (!data || !form) return error ? <Alert error={error} /> : <p className="muted">Loading…</p>
  const dirty = JSON.stringify(form) !== JSON.stringify(data.values)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const save = async () => {
    setBusy('save'); setError(''); setOk('')
    try {
      const d = await api('/admin/settings/', { method: 'PATCH', body: form })
      setData(d); setForm(d.values); site.refresh()
      setOk('Settings saved. The whole site now uses them.')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const upload = async (key, file) => {
    setBusy(key); setError(''); setOk('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      setData(await api(`/admin/settings/image/${key}/`, { method: 'POST', form: fd }))
      site.refresh(); setOk('Image updated.')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const remove = async (key) => {
    setBusy(key); setError(''); setOk('')
    try {
      setData(await api(`/admin/settings/image/${key}/`, { method: 'DELETE' }))
      site.refresh(); setOk('Reset to the default image.')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  return (
    <div className="stack">
      <PageHeader title="Site settings" subtitle="Change the logo, colours and wording of the whole site. Changes apply to everyone straight away.">
        <button className="btn" disabled={!dirty || busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
      </PageHeader>
      <Alert error={error} ok={ok} />

      <h2>Logo and images</h2>
      <div className="setting-grid">
        {IMAGES.map((item) => (
          <ImageCard key={item.key} item={item} url={data.images[item.key]} busy={busy === item.key} onUpload={upload} onRemove={remove} />
        ))}
      </div>

      <h2>Colours</h2>
      <div className="card stack">
        <div className="two">
          <ColorField label="Main colour (buttons, links, highlights)" value={form.color_primary} onChange={(v) => setForm({ ...form, color_primary: v })} fallback={data.defaults.color_primary} />
          <ColorField label="Dark colour (headings, banners, footer areas)" value={form.color_dark} onChange={(v) => setForm({ ...form, color_dark: v })} fallback={data.defaults.color_dark} />
        </div>
        <div className="brand-preview" style={{ '--blue': isHex(form.color_primary) ? form.color_primary : '#056be3', '--navy': isHex(form.color_dark) ? form.color_dark : '#021433' }}>
          <div className="banner"><h1>{form.hero_title || 'Headline'}</h1><p>{form.hero_subtitle}</p></div>
          <div className="row gap wrap"><button type="button" className="btn">Primary button</button><button type="button" className="btn ghost">Secondary</button><span className="badge info">Badge</span><a className="small" href="#preview" onClick={(e) => e.preventDefault()}>A link</a></div>
        </div>
        <p className="muted small">This preview shows your colours before you save. Press "Save changes" to apply them site-wide.</p>
      </div>

      <h2>Wording</h2>
      <div className="card stack">
        <div className="two">
          {TEXTS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              {key === 'hero_subtitle' ? <textarea rows={3} value={form[key]} onChange={set(key)} /> : <input value={form[key]} onChange={set(key)} />}
            </Field>
          ))}
        </div>
      </div>

      <h2>Sign-ups and sign-in</h2>
      <div className="card stack">
        <label className="check"><input type="checkbox" checked={form.registration_open} onChange={set('registration_open')} /> Allow new tenants and landlords to sign up</label>
        <div className="row gap wrap">
          <span className={`badge ${data.providers.google ? 'ok' : ''}`}>Google sign-in: {data.providers.google ? 'connected' : 'not set up'}</span>
          <span className={`badge ${data.providers.facebook ? 'ok' : ''}`}>Facebook sign-in: {data.providers.facebook ? 'connected' : 'not set up'}</span>
        </div>
        <p className="muted small">Google and Facebook need keys that must stay secret, so they are set in the backend file <code>backend/.env</code> (see README, section 3f), not on this page.</p>
      </div>

      <div className="row gap">
        <button className="btn" disabled={!dirty || busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
        {dirty && <button className="btn ghost" onClick={() => setForm(data.values)}>Discard changes</button>}
      </div>
    </div>
  )
}
