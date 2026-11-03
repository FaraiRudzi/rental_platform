// Small date and wording helpers shared by the screens.
export function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`
  if (d < 31) { const w = Math.round(d / 7); return `${w} week${w === 1 ? '' : 's'} ago` }
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
}

export const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const fmtDay = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export function dayGroup(iso) {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This week' : 'Earlier'
}
