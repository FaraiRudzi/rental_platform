'use client'
import { useRef, useState } from 'react'
import { useConfirm } from '@/components/ConfirmDialog'
import DocPreview from '@/components/DocPreview'
import Icon from '@/components/Icons'
import { Alert, Badge, PageHeader, Stepper } from '@/components/ui'
import { api, when } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { useNavigate, useSearchParams } from '@/lib/nav-hooks'
import { toast } from '@/lib/toast'

const STATUS = {
  verified: { cls: 'ok', title: 'Verified', text: 'Your account is verified. The badges below are shown to other users.' },
  pending: { cls: 'info', title: 'Under review', text: 'We have your documents and are checking them. You will get an alert as each one is reviewed.' },
  rejected: { cls: 'bad', title: 'Needs attention', text: 'Some documents could not be accepted. Read the reasons and upload a replacement.' },
  unverified: { cls: 'warn', title: 'Not started', text: 'Upload the documents below so we can verify your account.' },
}
const TYPES = ['image/jpeg', 'image/png', 'application/pdf']

function UploadRow({ check, onDone }) {
  const [type, setType] = useState(check.doc_types[0].value)
  const [file, setFile] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef(null)

  const choose = (f) => {
    if (!f) return
    if (!TYPES.includes(f.type)) { setFile(null); setErr('Use a JPG, PNG or PDF file.'); return }
    if (f.size > 5 * 1024 * 1024) { setFile(null); setErr('That file is larger than 5 MB.'); return }
    setErr(''); setFile(f)
  }
  const upload = async () => {
    setBusy(true); setErr('')
    try {
      const form = new FormData()
      form.append('doc_type', type)
      form.append('file', file)
      await api('/me/verification-docs/', { method: 'POST', form })
      toast.success('Document uploaded. We will review it and let you know.')
      setFile(null); onDone()
    } catch (e) { setErr(e.message); toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="vdrop">
        <Icon name="upload" size={20} />
        {check.doc_types.length > 1 && (
          <select aria-label="Document type" value={type} onChange={(e) => setType(e.target.value)}>
            {check.doc_types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
        <span className="fname">{file ? file.name : 'No file chosen. JPG, PNG or PDF, up to 5 MB.'}</span>
        <input ref={input} className="vfile" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => { choose(e.target.files[0]); e.target.value = '' }} />
        <button type="button" className="btn ghost sm" onClick={() => input.current.click()}>Choose file</button>
        <button type="button" className="btn sm" disabled={!file || busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload'}</button>
      </div>
      {err && <small className="field-error" role="alert">{err}</small>}
    </div>
  )
}

function DocRow({ d, onChange }) {
  const confirm = useConfirm()
  const [show, setShow] = useState(false)
  const remove = async () => {
    if (!(await confirm({ title: 'Remove this document?', message: `Your ${d.doc_label.toLowerCase()} will be deleted. You can upload another one.`, confirmLabel: 'Remove', cancelLabel: 'Keep it', tone: 'danger' }))) return
    try { await api(`/me/verification-docs/${d.id}/`, { method: 'DELETE' }); toast.success('Document removed.'); onChange() } catch (e) { toast.error(e.message) }
  }
  return (
    <div className="vdoc">
      <div className="vdoc-row">
        <Icon name="file" size={18} />
        <div className="grow"><strong>{d.doc_label}</strong> <span className="muted small">uploaded {when(d.created_at)}</span></div>
        <Badge status={d.status} />
        <button className="btn ghost xs" onClick={() => setShow(!show)}>{show ? 'Hide' : 'View'}</button>
        {d.status !== 'approved' && <button className="btn danger xs" onClick={remove}>Remove</button>}
      </div>
      {d.status === 'rejected' && d.review_note && <div className="alert bad" style={{ margin: 0 }}><strong>Not accepted:</strong> {d.review_note}</div>}
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
  const step = { unverified: 0, rejected: 0, pending: 1, verified: 2 }[data.status] ?? 0

  return (
    <div className="stack">
      <PageHeader title="Verify your account" subtitle={isLandlord ? 'Verified landlords earn tenants\u2019 trust and get listings approved faster.' : 'Verified tenants are more likely to be accepted by landlords.'} />
      {sp.get('welcome') === '1' && (
        <div className="note row between wrap">
          <span><strong>Welcome aboard!</strong> Upload your documents now so we can start checking them, or come back any time from <em>Verification</em> in the menu.</span>
          <button className="btn ghost sm" onClick={() => nav(isLandlord ? '/landlord' : '/')}>Skip for now</button>
        </div>
      )}

      <div className="vwrap">
        <div className="stack">
          {data.checks.map((c) => {
            const docs = data.docs.filter((d) => c.doc_types.some((t) => t.value === d.doc_type))
            const tone = c.status === 'approved' ? 'ok' : c.status === 'rejected' ? 'bad' : c.status === 'pending' ? 'warn' : ''
            return (
              <div className="vitem" key={c.key}>
                <div className="vhead">
                  <span className={`vico ${tone}`}><Icon name={c.status === 'approved' ? 'shield' : 'file'} size={19} /></span>
                  <div className="grow">
                    <h3>{c.title} {c.required ? <span className="badge info">Required</span> : <span className="badge">Optional</span>}</h3>
                    <p className="muted small" style={{ margin: '3px 0 0' }}>{c.hint}</p>
                  </div>
                  <Badge status={c.status === 'missing' ? 'not started' : c.status} />
                </div>
                {docs.map((d) => <DocRow key={d.id} d={d} onChange={changed} />)}
                {c.status !== 'approved' && <UploadRow check={c} onDone={changed} />}
              </div>
            )
          })}
        </div>

        <aside className="vside">
          <div className={`status-hero ${s.cls}`}>
            <div>
              <div className="status-title">{s.title}</div>
              <p className="small" style={{ margin: '4px 0' }}>{s.text}</p>
            </div>
          </div>
          <div className="card stack" style={{ gap: 10 }}>
            <Stepper steps={['Upload', 'We review', 'Verified']} current={step} />
            <div>
              <div className="row between small"><span className="muted">Required checks</span><strong>{done} of {required.length}</strong></div>
              <div className="progress" aria-hidden="true"><i style={{ width: `${required.length ? (done / required.length) * 100 : 0}%` }} /></div>
            </div>
            {data.badges.length > 0 && <div className="chips">{data.badges.map((b) => <span key={b} className="badge ok">✓ {b}</span>)}</div>}
          </div>
          <div className="card stack" style={{ gap: 6 }}>
            <strong>Tips for a quick approval</strong>
            <ul className="tips small" style={{ margin: 0 }}>
              <li>Good light, all four corners visible.</li>
              <li>The name must match your account.</li>
              <li>Current and readable. Blurry photos are sent back.</li>
            </ul>
            <p className="muted small" style={{ margin: 0 }}>Your documents are private. Only our verification team can open them. Others only see badges such as &quot;ID verified&quot;.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
