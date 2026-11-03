'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Icon from './Icons'

// const confirm = useConfirm(); if (await confirm({ title, message, confirmLabel, tone })) { ... }
const Ctx = createContext(() => Promise.resolve(true))
export const useConfirm = () => useContext(Ctx)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), [])
  const close = (result) => { state?.resolve(result); setState(null) }

  useEffect(() => {
    if (!state) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { state.resolve(false); setState(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-backdrop" onClick={() => close(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
            <div className={`modal-icon ${state.tone || 'warn'}`}><Icon name={state.tone === 'info' ? 'info' : 'alert'} size={22} /></div>
            <h3 id="confirm-title">{state.title}</h3>
            <p className="muted">{state.message}</p>
            <div className="modal-actions">
              <button className="btn ghost sm" onClick={() => close(false)} autoFocus>{state.cancelLabel || 'Keep it'}</button>
              <button className={`btn sm ${state.tone === 'danger' ? 'danger-solid' : ''}`} onClick={() => close(true)}>{state.confirmLabel || 'Yes, continue'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
