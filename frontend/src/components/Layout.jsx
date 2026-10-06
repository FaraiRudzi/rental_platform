import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) { setUnread(0); return }
    const poll = () => api('/me/notifications/').then((d) => setUnread(d.unread)).catch(() => {})
    poll()
    const id = setInterval(poll, 30000)
    return () => clearInterval(id)
  }, [user])

  return (
    <>
      <header className="topbar navbar">
        <div className="topbar-inner container-fluid">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">R</span>
            <span>rental<span className="brand-light">space</span></span>
          </Link>
          <nav className="topbar-nav nav" aria-label="Main navigation">
            <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Find a home</NavLink>
            {user && <span className={`role-indicator role-${user.role}`}>{user.role === 'admin' ? 'Administrator' : user.role === 'landlord' ? 'Landlord' : 'Tenant'}</span>}
            {user?.role === 'tenant' && (<><NavLink to="/deals" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>My applications</NavLink><NavLink to="/saved" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Saved searches</NavLink></>)}
            {user?.role === 'landlord' && <NavLink to="/landlord" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>My dashboard</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Admin</NavLink>}
            {user && <NavLink to="/notifications" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Alerts{unread > 0 && <span className="dot">{unread}</span>}</NavLink>}
            {user?.role === 'landlord'
              ? <Link to="/landlord/new" className="btn btn-sm btn-primary nav-login">Add a property</Link>
              : !user && <Link to="/login?role=landlord" className="btn btn-sm btn-primary nav-login">List a property</Link>}
            {!user && <Link to="/login?mode=admin" className="nav-link admin-login-link">Admin sign in</Link>}
            {user
              ? <button className="btn btn-sm btn-outline-secondary nav-signout" onClick={() => { logout(); nav('/') }}>Log out <span className="d-none d-xl-inline">({user.full_name.split(' ')[0]})</span></button>
              : <NavLink to="/login" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Log in</NavLink>}
          </nav>
        </div>
      </header>
      <main className="container py-4 py-lg-5"><Outlet /></main>
    </>
  )
}
