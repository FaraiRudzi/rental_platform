// Public images only (listing photos and site branding). ID documents are never served from here.
const BACKEND = process.env.API_INTERNAL_URL || 'http://127.0.0.1:8000'
export const dynamic = 'force-dynamic'

export async function GET(request, context) {
  const { path = [] } = await context.params
  if (!['listings', 'site'].includes(path[0]) || path.some((p) => p === '..' || p.includes('\\'))) {
    return new Response('Not found', { status: 404 })
  }
  let upstream
  try { upstream = await fetch(`${BACKEND}/media/${path.join('/')}`, { cache: 'no-store' }) } catch { return new Response('Unavailable', { status: 502 }) }
  if (!upstream.ok) return new Response('Not found', { status: 404 })
  return new Response(upstream.body, {
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'public, max-age=86400' },
  })
}
