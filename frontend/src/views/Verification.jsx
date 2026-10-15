'use client'

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from '@/lib/nav-hooks'
import { api, when } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import DocPreview from '@/components/DocPreview'
import { Alert, Badge, Field, PageHeader } from '@/components/ui'
import { useFetch } from '@/lib/hooks'

const STATUS = {
  verified: { cls: 'ok', title: 'Verified', text: 'Your account is verified. The badges below are shown to other users.' },
  pending: { cls: 'info', title: 'Under review', text: 'We have your documents and are checking them. You will get an alert as soon as each one is reviewed.' },
  rejected: { cls: 'bad', title: 'Needs attention', text: 'Some documents could not be accepted. Read the reasons below and upload a replacement.' },
  unverified: { cls: 'warn', title: 'Not started', text: 'Upload the documents below so we can verify your account.' },
}

function UploadForm({ check, onDone }) {
  const [type, setType] = useState(check.doc_types[0].value)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return undefined }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const submit = async (e) => {
    e.preventDefault()
    const formEl = e.currentTarget
    if (!file) { setError('Choose a file first.'); return }
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('doc_type', type)
      form.append('file', file)
      await api('/me/verification-docs/', { method: 'POST', form })
      setFile(null); formEl.reset(); onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <form className="upload-box" onSubmit={submit}>
      <Alert error={error} />
      <div className="two">
        {check.doc_types.length > 1 && (
          <Field label="Document type">
            <select value={type} onChange={(e) => setType(e.target.value)}>{check.doc_types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </Field>
        )}
        <Field label="Photo or PDF" hint="JPG, PNG or PDF, up to 5 MB.">
          <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
        </Field>
      </div>
      {preview && <img className="upload-thumb" src={preview} alt="Selected file preview" />}
      <button className="btn" disabled={busy || !file}>{busy ? 'Uploading…' : `Upload ${check.doc_types.length === 1 ? check.doc_types[0].label.toLowerCase() : 'document'}`}</button>
    </form>
  )
}

function DocRow({ d, onChange }) {
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => {
    if (!window.confirm('Remove this document?')) return
    try { await api(`/me/verification-docs/${d.id}/`, { method: 'DELETE' }); onChange() } catch (e) { setError(e.message) }
  }
  return (
    <div className="doc-row">
      <div className="row between wrap">
        <div><strong>{d.doc_label}</strong> <span className="muted small">uploaded {when(d.created_at)}</span></div>
        <div className="row gap"><Badge status={d.status} />
          <button className="link small" onClick={() => setShow(!show)}>{show ? 'Hide' : 'View'}</button>
          {d.status !== 'approved' && <button className="link small" onClick={remove}>Remove</button>}
        </div>
      </div>
      {d.status === 'rejected' && d.review_note && <div className="alert bad"><strong>Not accepted:</strong> {d.review_note}</div>}
      <Alert error={error} />
      {show && <DocPreview path={`/me/verification-docs/${d.id}/file/`} kind={d.kind} />}
    </div>
  )
}

export default function Verification() {
  const { user, refreshUser } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { data, error, reload } = useFetch('/me/verification/')
  const changed = () => { reload(); refreshUser() }
  const isLandlord = user.role === 'landlord'

  if (error) return <Alert error={error} />
  if (!data) return <p className="muted">Loading…</p>
  const s = STATUS[data.status] || STATUS.unverified
  const required = data.checks.filter((c) => c.required)
  const done = required.filter((c) => c.status === 'approved').length

  return (
    <div className="stack">
      <PageHeader title="Verify your account" subtitle={isLandlord ? 'Verified landlords earn tenants\u2019 trust and get listings approved faster.' : 'Verified tenants are more likely to be accepted by landlords.'} />

      {sp.get('welcome') === '1' && (
        <div className="note">
          <strong>Welcome aboard!</strong> Upload your documents now so we can start checking them, or come back any time from the <em>Verification</em> link in the menu.
          <div style={{ marginTop: 8 }}><button className="btn ghost" onClick={() => nav(isLandlord ? '/landlord' : '/')}>Skip for now</button></div>
        </div>
      )}

      <div className={`status-hero ${s.cls}`}>
        <div>
          <div className="status-title">{s.title}</div>
          <p>{s.text}</p>
          <p className="small muted">{done} of {required.length} required checks complete</p>
        </div>
        {data.badges.length > 0 && <div className="chips">{data.badges.map((b) => <span key={b} className="badge ok">✓ {b}</span>)}</div>}
      </div>

      {data.checks.map((c) => {
        const docs = data.docs.filter((d) => c.doc_types.some((t) => t.value === d.doc_type))
        return (
          <div className="card check-card" key={c.key}>
            <div className="row between wrap">
              <div>
                <h3>{c.title} {c.required ? <span className="badge info">Required</span> : <span className="badge">Optional</span>}</h3>
                <p className="muted small">{c.hint}</p>
              </div>
              <Badge status={c.status === 'missing' ? 'not started' : c.status} />
            </div>
            {docs.map((d) => <DocRow key={d.id} d={d} onChange={changed} />)}
            {c.status !== 'approved' && <UploadForm check={c} onDone={changed} />}
          </div>
        )
      })}

      <div className="card">
        <h3>Tips for a quick approval</h3>
        <ul className="tips">
          <li>Take the photo in good light with all four corners of the document visible.</li>
          <li>The name on the document must match the name on your account.</li>
          <li>Documents must be current and readable. Blurry or cropped photos are sent back.</li>
        </ul>
        <p className="muted small">Your documents are private. Only our verification team can open them. Other people only see badges such as "ID verified", never the documents.</p>
      </div>
    </div>
  )
}
