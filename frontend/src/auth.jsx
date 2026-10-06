import { createContext, useContext, useEffect, useState } from 'react'
import { api, tokens } from './api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!tokens.get())

  useEffect(() => {
    if (tokens.get()) api('/me/').then(setUser).catch(() => tokens.clear()).finally(() => setLoading(false))
    const onLogout = () => setUser(null)
    window.addEventListener('rp:logout', onLogout)
    return () => window.removeEventListener('rp:logout', onLogout)
  }, [])

  const login = (data) => { tokens.set({ access: data.access, refresh: data.refresh }); setUser(data.user) }
  const logout = () => { tokens.clear(); setUser(null) }
  return <Ctx.Provider value={{ user, setUser, loading, login, logout }}>{children}</Ctx.Provider>
}
