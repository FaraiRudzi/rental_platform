import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

function BellIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  // Keep the unread count honest: poll, refresh when the tab regains focus, and refresh
  // immediately whenever any page marks alerts as read (event "rp:refresh-alerts").
  useEffect(() => {
    if (!user) { setUnread(0); return undefined }
    const poll = () => api('/me/notifications/').then((d) => setUnread(d.unread)).catch(() => {})
    const onVisible = () => { if (document.visibilityState === 'visible') poll() }
    poll()
    const id = setInterval(poll, 30000)
    window.addEventListener('rp:refresh-alerts', poll)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('rp:refresh-alerts', poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="NexaSoft Technologies, home">
            <img className="logo-full" src="/logo.png" alt="NexaSoft Technologies" />
            <img className="logo-mark" src="/logo-mark.png" alt="NexaSoft Technologies" />
          </Link>
          <button className="menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '✕' : '☰'}</button>
          <div className={`topbar-menu ${open ? 'open' : ''}`}>
            <nav>
              <NavLink to="/" end>Find a home</NavLink>
              {user?.role === 'tenant' && (<><NavLink to="/deals">My applications</NavLink><NavLink to="/saved">Saved searches</NavLink></>)}
              {user?.role === 'landlord' && <NavLink to="/landlord">My dashboard</NavLink>}
              {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
            </nav>
            <div className="topbar-right">
              {user ? (
                <>
                  <NavLink to="/notifications" className="bell" aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`}>
                    <BellIcon />
                    {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
                  </NavLink>
                  <div className="user-chip">
                    <span className="avatar">{user.full_name.trim()[0]?.toUpperCase()}</span>
                    <span className="who"><strong>{user.full_name.split(' ')[0]}</strong><small>{user.role}</small></span>
                  </div>
                  <button className="btn ghost" onClick={() => { logout(); nav('/') }}>Log out</button>
                </>
              ) : (
                <>
                  <Link className="btn ghost" to="/login">Log in</Link>
                  <Link className="btn" to="/register">Sign up</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="container"><Outlet /></main>
      <footer className="footer">
        <img src="/logo-mark.png" alt="" />
        © {new Date().getFullYear()} NexaSoft Technologies · Innovation through technology
      </footer>
    </div>
  )
}
