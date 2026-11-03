'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { timeAgo } from '@/lib/format'
import { useNavigate } from '@/lib/nav-hooks'
import { eventMeta, targetFor } from '@/lib/notifications'
import Icon from './Icons'
import Link from './Link'

// The bell in the header: opens a panel with the latest alerts instead of jumping to another page.
export default function NotificationBell({ unread }) {
  const { user } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)
  const box = useRef(null)
  const refresh = () => window.dispatchEvent(new Event('rp:refresh-alerts'))
  const load = () => api('/me/notifications/').then((d) => setItems(d.results.slice(0, 8))).catch(() => setItems([]))

  useEffect(() => { if (open) load() }, [open, unread]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const openItem = async (n) => {
    setOpen(false)
    if (!n.read_at) { try { await api(`/me/notifications/${n.id}/read/`, { method: 'POST' }) } catch { /* the badge refreshes anyway */ } refresh() }
    const to = targetFor(n, user.role)
    if (to) nav(to)
  }
  const markAll = async () => { try { await api('/me/notifications/read-all/', { method: 'POST' }) } catch { /* ignore */ } refresh(); load() }

  return (
    <div className="bellwrap" ref={box}>
      <button className="bell" aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" size={21} />
        {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="npanel" role="dialog" aria-label="Alerts">
          <div className="npanel-h">
            <strong>Alerts</strong>
            {unread > 0 && <button className="link small" onClick={markAll}>Mark all as read</button>}
          </div>
          <div className="npanel-list">
            {items === null && <p className="muted small" style={{ padding: 14 }}>Loading…</p>}
            {items?.length === 0 && <p className="muted small" style={{ padding: 18, textAlign: 'center' }}>You are all caught up.</p>}
            {items?.map((n) => {
              const { icon, tone } = eventMeta(n.event)
              return (
                <button key={n.id} className={`nitem ${n.read_at ? '' : 'unread'}`} onClick={() => openItem(n)}>
                  <span className={`nico ${tone}`}><Icon name={icon} size={17} /></span>
                  <span className="ntext"><strong>{n.title}</strong><span className="nb">{n.body}</span><span className="ntime">{timeAgo(n.created_at)}</span></span>
                  {!n.read_at && <span className="udot" aria-label="Unread" />}
                </button>
              )
            })}
          </div>
          <div className="npanel-f"><Link to="/notifications" className="small" onClick={() => setOpen(false)}><strong>See all alerts</strong></Link></div>
        </div>
      )}
    </div>
  )
}
