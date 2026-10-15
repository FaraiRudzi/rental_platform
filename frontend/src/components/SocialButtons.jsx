'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { home } from '@/lib/nav'
import { useNavigate } from '@/lib/nav-hooks'
import { useSite } from '@/lib/site'

// "Continue with Google / Facebook". Shown only when the admin has set the keys up (see README, 3f).
const loaders = {}
function loadScript(src) {
  loaders[src] ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src; s.async = true; s.defer = true
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load the sign-in service. Check your connection.'))
    document.head.appendChild(s)
  })
  return loaders[src]
}
let fbReady
function loadFacebook(appId) {
  fbReady ??= new Promise((resolve, reject) => {
    window.fbAsyncInit = () => { window.FB.init({ appId, cookie: true, xfbml: false, version: 'v19.0' }); resolve(window.FB) }
    loadScript('https://connect.facebook.net/en_US/sdk.js').catch(reject)
  })
  return fbReady
}

const FbIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.8c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.3H7.5V13h2.8v8h3.2z" /></svg>
)

export default function SocialButtons({ role = null, next = null, label = 'Continue' }) {
  const site = useSite()
  const { login } = useAuth()
  const nav = useNavigate()
  const googleRef = useRef(null)
  const [fbOk, setFbOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (provider, token) => {
    setBusy(true); setError('')
    try {
      const data = await api('/auth/social/', { method: 'POST', body: { provider, token } })
      if (data.access) { login(data); nav(next || home(data.user.role)) }
      else {
        sessionStorage.setItem('rp_social', JSON.stringify({ ...data, role }))
        nav(`/social/complete${next ? `?next=${encodeURIComponent(next)}` : ''}`)
      }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const submitRef = useRef(submit)
  submitRef.current = submit // the provider callbacks always call the latest version

  useEffect(() => {
    if (!site.google_client_id) return undefined
    let cancelled = false
    loadScript('https://accounts.google.com/gsi/client').then(() => {
      if (cancelled || !googleRef.current) return
      window.google.accounts.id.initialize({ client_id: site.google_client_id, callback: (r) => submitRef.current('google', r.credential) })
      window.google.accounts.id.renderButton(googleRef.current, { theme: 'outline', size: 'large', width: 340, text: 'continue_with', shape: 'rectangular' })
    }).catch((e) => setError(e.message))
    return () => { cancelled = true }
  }, [site.google_client_id])

  useEffect(() => {
    if (site.facebook_app_id) loadFacebook(site.facebook_app_id).then(() => setFbOk(true)).catch((e) => setError(e.message))
  }, [site.facebook_app_id])

  if (!site.google_client_id && !site.facebook_app_id) return null

  const facebook = () => { // must run straight from the click, or the browser blocks the pop-up
    setError('')
    window.FB.login((r) => {
      if (r.authResponse?.accessToken) submitRef.current('facebook', r.authResponse.accessToken)
      else setError('Facebook sign-in was cancelled.')
    }, { scope: 'public_profile,email' })
  }

  return (
    <>
      <div className="social">
        {site.google_client_id && <div ref={googleRef} className="g-slot" />}
        {site.facebook_app_id && <button type="button" className="btn-fb" onClick={facebook} disabled={!fbOk || busy}><FbIcon /> {label} with Facebook</button>}
        {error && <div className="alert bad" role="alert">{error}</div>}
      </div>
      <div className="divider"><span>or use your email or phone</span></div>
    </>
  )
}
