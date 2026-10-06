import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

export function useFetch(path, params) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const key = path + JSON.stringify(params || {})
  const load = useCallback(() => {
    if (!path) return
    setLoading(true)
    api(path, { params }).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(load, [load])
  return { data, error, loading, reload: load }
}

// Runs an async action, tracks busy/error state, and optionally reloads afterwards.
export function useAction(after) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const run = async (fn, okMessage = '') => {
    setBusy(true); setError(''); setOk('')
    try { const r = await fn(); if (okMessage) setOk(okMessage); if (after) after(); return r }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return { run, busy, error, ok, setError }
}
