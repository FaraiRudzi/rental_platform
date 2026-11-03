'use client'
import { useMemo, useState } from 'react'
import Icon from '@/components/Icons'
import { Alert, EmptyState, PageHeader } from '@/components/ui'
import { api, when } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { dayGroup, timeAgo } from '@/lib/format'
import { useFetch } from '@/lib/hooks'
import { useNavigate } from '@/lib/nav-hooks'
import { eventMeta, targetFor } from '@/lib/notifications'

const ORDER = ['Today', 'Yesterday', 'This week', 'Earlier']

export default function Notifications() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { data, error, reload } = useFetch('/me/notifications/')
  const [tab, setTab] = useState('all')
  const refreshBadge = () => window.dispatchEvent(new Event('rp:refresh-alerts'))

  const groups = useMemo(() => {
    const items = (data?.results || []).filter((n) => tab === 'all' || !n.read_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const by = {}
    items.forEach((n) => { (by[dayGroup(n.created_at)] ||= []).push(n) })
    return ORDER.filter((k) => by[k]).map((k) => [k, by[k]])
  }, [data, tab])

  const open = async (n) => {
    if (!n.read_at) { try { await api(`/me/notifications/${n.id}/read/`, { method: 'POST' }) } catch { /* reloads below */ } refreshBadge() }
    const to = targetFor(n, user.role)
    if (to) nav(to); else reload()
  }
  const markAll = async () => { try { await api('/me/notifications/read-all/', { method: 'POST' }) } catch { /* ignore */ } refreshBadge(); reload() }
  const unread = data?.unread || 0

  return (
    <div className="stack nfull">
      <PageHeader title="Alerts" subtitle={unread ? `${unread} unread` : 'You are all caught up.'}>
        {unread > 0 && <button className="btn ghost sm" onClick={markAll}><Icon name="check" size={15} /> Mark all as read</button>}
      </PageHeader>
      <div className="tabs">
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All</button>
        <button className={tab === 'unread' ? 'on' : ''} onClick={() => setTab('unread')}>Unread{unread > 0 && <span className="cnt">{unread}</span>}</button>
      </div>
      <Alert error={error} />
      {data && groups.length === 0 && (
        <EmptyState icon="bell" title={tab === 'unread' ? 'No unread alerts' : 'No alerts yet'}>
          {tab === 'unread' ? 'Everything has been read.' : 'Updates about your applications, listings and payments will appear here.'}
        </EmptyState>
      )}
      {groups.map(([label, list]) => (
        <section key={label}>
          <div className="ngroup">{label}</div>
          {list.map((n) => {
            const { icon, tone } = eventMeta(n.event)
            return (
              <button key={n.id} className={`nitem ${n.read_at ? '' : 'unread'}`} onClick={() => open(n)} title={when(n.created_at)}>
                <span className={`nico ${tone}`}><Icon name={icon} size={17} /></span>
                <span className="ntext"><strong>{n.title}</strong><span className="nb">{n.body}</span><span className="ntime">{timeAgo(n.created_at)}</span></span>
                {!n.read_at && <span className="udot" aria-label="Unread" />}
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
