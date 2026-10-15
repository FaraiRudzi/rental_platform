'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { api, tokens } from './api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // same on server and browser, so there is no hydration mismatch

  useEffect(() => {
    if (tokens.get()) api('/me/').then(setUser).catch(() => tokens.clear()).finally(() => setLoading(false))
    else setLoading(false)
    const onLogout = () => setUser(null)
    window.addEventListener('rp:logout', onLogout)
    return () => window.removeEventListener('rp:logout', onLogout)
  }, [])

  const login = (data) => { tokens.set({ access: data.access, refresh: data.refresh }); setUser(data.user) }
  const logout = () => { tokens.clear(); setUser(null) }
  const refreshUser = () => api('/me/').then(setUser).catch(() => {})
  return <Ctx.Provider value={{ user, setUser, loading, login, logout, refreshUser }}>{children}</Ctx.Provider>
}
