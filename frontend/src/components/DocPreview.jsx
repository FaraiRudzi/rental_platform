'use client'

import { useEffect, useState } from 'react'
import { fetchBlob } from '@/lib/api'

// Shows a private document (image or PDF) fetched with the login token.
export default function DocPreview({ path, kind }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    let objectUrl = null
    fetchBlob(path)
      .then((blob) => { if (alive) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [path])

  if (error) return <div className="alert bad">{error}</div>
  if (!url) return <p className="muted small">Loading document…</p>
  return (
    <div className="doc-preview">
      {kind === 'pdf'
        ? <iframe className="doc-frame" src={url} title="Document" />
        : <img className="doc-img" src={url} alt="Uploaded document" />}
      <a className="small" href={url} target="_blank" rel="noreferrer">Open in a new tab</a>
    </div>
  )
}
