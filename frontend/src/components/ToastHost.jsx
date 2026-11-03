'use client'
import { useEffect, useState } from 'react'

let nextId = 1

export default function ToastHost() {
  const [items, setItems] = useState([])
  const dismiss = (id) => setItems((list) => list.filter((t) => t.id !== id))

  useEffect(() => {
    const onToast = (e) => {
      const id = nextId++
      const { type, message } = e.detail
      setItems((list) => [...list.slice(-3), { id, type, message }])
      setTimeout(() => dismiss(id), type === 'error' ? 9000 : 5000)
    }
    window.addEventListener('rp:toast', onToast)
    return () => window.removeEventListener('rp:toast', onToast)
  }, [])

  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon">{t.type === 'error' ? '!' : t.type === 'info' ? 'i' : '✓'}</span>
          <span className="toast-text">{t.message}</span>
          <button className="toast-x" aria-label="Dismiss message" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
