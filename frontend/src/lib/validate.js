// Checks used while people type, so mistakes are shown straight away.
export const PHONE_RE = /^\+\d{8,15}$/
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export const cleanPhone = (v) => (v || '').replace(/[\s()-]/g, '')
export const phoneError = (v) => (!v ? '' : PHONE_RE.test(cleanPhone(v)) ? '' : 'Use international format, for example +263771234567.')
export const emailError = (v) => (!v ? '' : EMAIL_RE.test(v.trim()) ? '' : 'That email address does not look right.')
export const nameError = (v) => (!v ? '' : v.trim().length < 2 ? 'Enter your full name.' : '')
export const passwordError = (v) => (!v ? '' : v.length < 8 ? 'Use at least 8 characters.' : /^\d+$/.test(v) ? 'Add some letters. A password of only digits is too easy to guess.' : '')
export const identifierError = (v) => {
  const t = (v || '').trim()
  if (!t) return ''
  return t.includes('@') ? emailError(t) : PHONE_RE.test(cleanPhone(t)) ? '' : 'Enter an email address, or a phone number like +263771234567.'
}
