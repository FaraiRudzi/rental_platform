'use client'
import { useState } from 'react'
import { useConfirm } from '@/components/ConfirmDialog'
import DocPreview from '@/components/DocPreview'
import Icon from '@/components/Icons'
import { Alert, Avatar, Badge, EmptyState } from '@/components/ui'
import { api, when } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import { toast } from '@/lib/toast'

const TONE = { approved: 'ok', pending: 'warn', rejected: 'bad', missing: '' }

function DocReview({ d, onDone }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const decide = async (status) => {
    if (status === 'rejected' && note.trim().length < 5) { setErr('Give the reason, so the person can upload a better copy.'); return }
    setBusy(true); setErr('')
    try {
      await api(`/admin/verification-docs/${d.id}/review/`, { method: 'POST', body: { status, note: note.trim() } })
      toast.success(status === 'approved' ? `${d.doc_label} approved.` : `${d.doc_label} rejected. The person was told why.`)
      setOpen(false); setNote(''); onDone()
    } catch (e) { setErr(e.message); toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="vdoc">
      <div className="vdoc-row">
        <Icon name="file" size={18} />
        <div className="grow">
          <strong>{d.doc_label}</strong> <span className="muted small">uploaded {when(d.created_at)}</span>
          {d.review_note && <div className="muted small">Note sent: {d.review_note}</div>}
        </div>
        <Badge status={d.status} />
        <button className={`btn xs ${open ? 'ghost' : ''}`} onClick={() => setOpen(!open)}>{open ? 'Close' : d.status === 'pending' ? 'Review' : 'View'}</button>
      </div>
      {open && (
        <div className="vreview">
          <DocPreview path={`/admin/verification-docs/${d.id}/file/`} kind={d.kind} />
          <div className="stack" style={{ gap: 10 }}>
            <div className="helpnote"><Icon name="info" size={16} /><span>Check that the document is clear and current, the name matches the account, and it is the right kind of document.</span></div>
            <label className="field"><span>Reason (needed to reject)</span>
              <textarea rows={3} maxLength={200} value={note} onChange={(e) => { setNote(e.target.value); setErr('') }} placeholder="e.g. The photo is blurry. Please upload a clearer one." />
            </label>
            {err && <small className="field-error" role="alert">{err}</small>}
            <div className="row gap wrap">
              <button className="btn sm" disabled={busy || d.status === 'approved'} onClick={() => decide('approved')}><Icon name="check" size={14} /> Approve</button>
              <button className="btn danger sm" disabled={busy || d.status === 'rejected'} onClick={() => decide('rejected')}><Icon name="x" size={14} /> Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminVerification() {
  const [filter, setFilter] = useState('pending')
  const { data, error, reload } = useFetch('/admin/verification/', { status: filter })
  const confirm = useConfirm()
  const [msgs, setMsgs] = useState({})
  const [busy, setBusy] = useState(false)

  const override = async (u, status) => {
    const yes = await confirm({
      title: status === 'verified' ? `Mark ${u.name} as verified?` : `Mark ${u.name} as rejected?`,
      message: status === 'verified' ? 'This skips the document checks. Only do this if you have verified them another way.' : 'The person will be told their verification was not successful.',
      confirmLabel: status === 'verified' ? 'Yes, verify' : 'Yes, reject', tone: status === 'verified' ? 'info' : 'danger',
    })
    if (!yes) return
    setBusy(true)
    try { await api(`/admin/users/${u.id}/verification/`, { method: 'POST', body: { status, note: msgs[u.id] || '' } }); toast.success(`${u.name} was marked ${status}.`); reload() } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="stack">
      <div className="note">
        <strong>How to review.</strong> Press <em>Review</em> on a document to open it. Approve it, or reject it with a reason (the reason is sent to the person so they can upload a better copy).
        When every required document is approved, the account becomes verified automatically.
      </div>
      <div className="seg" role="group" aria-label="Show">
        {[['pending', 'Waiting for review'], ['reviewed', 'Reviewed'], ['all', 'Everyone']].map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <Alert error={error} />
      {data?.length === 0 && <EmptyState icon="shield" title={filter === 'pending' ? 'Nothing is waiting for review' : 'No documents here yet'}>{filter === 'pending' ? 'New uploads will appear here, with a red badge on this tab.' : 'Try another view.'}</EmptyState>}

      {data?.map(({ user: u, checks, docs, pending_count: pending }) => (
        <div className="vitem" key={u.id}>
          <div className="vhead">
            <Avatar name={u.name} />
            <div className="grow">
              <h3>{u.name} <span className="badge info">{u.role}</span> <Badge status={u.verification_status} /></h3>
              <div className="muted small">{u.phone}{u.email && ` · ${u.email}`} · joined {when(u.created_at)}{pending > 0 && ` · ${pending} waiting`}</div>
            </div>
          </div>
          <div className="chips">
            {checks.map((c) => <span key={c.key} className={`badge ${TONE[c.status]}`}>{c.title}{c.required ? '' : ' (optional)'}: {c.status === 'missing' ? 'not provided' : c.status}</span>)}
          </div>
          {docs.map((d) => <DocReview key={d.id} d={d} onDone={reload} />)}
          <details className="override">
            <summary>Manual override for the whole account</summary>
            <div className="row gap wrap" style={{ marginTop: 8 }}>
              <input style={{ flex: 1, minWidth: 200 }} placeholder="Message to the person (optional)" maxLength={200} value={msgs[u.id] || ''} onChange={(e) => setMsgs({ ...msgs, [u.id]: e.target.value })} />
              <button className="btn ghost sm" disabled={busy} onClick={() => override(u, 'verified')}>Mark verified</button>
              <button className="btn danger sm" disabled={busy} onClick={() => override(u, 'rejected')}>Mark rejected</button>
            </div>
          </details>
        </div>
      ))}
    </div>
  )
}
