// Forwards /api/* to the Django backend. Django's URLs end with a slash and Next removes trailing
// slashes, so the slash is put back here. The visitor's IP is passed on so rate limits work per visitor.
const BACKEND = process.env.API_INTERNAL_URL || 'http://127.0.0.1:8000'
export const dynamic = 'force-dynamic'

const SKIP_REQUEST = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'])
const SKIP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection'])

async function proxy(request, context) {
  const { path = [] } = await context.params
  let pathname = `/api/${path.join('/')}`
  if (!pathname.endsWith('/')) pathname += '/'
  const target = `${BACKEND}${pathname}${new URL(request.url).search}`

  const headers = new Headers()
  request.headers.forEach((value, key) => { if (!SKIP_REQUEST.has(key.toLowerCase())) headers.set(key, value) })
  headers.set('x-forwarded-for', (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '127.0.0.1')

  const hasBody = !['GET', 'HEAD'].includes(request.method)
  let upstream
  try {
    upstream = await fetch(target, {
      method: request.method, headers, redirect: 'manual', cache: 'no-store',
      body: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined,
    })
  } catch {
    return Response.json({ detail: 'The server is not reachable right now. Please try again in a moment.' }, { status: 502 })
  }
  const out = new Headers()
  upstream.headers.forEach((value, key) => { if (!SKIP_RESPONSE.has(key.toLowerCase())) out.set(key, value) })
  return new Response([204, 304].includes(upstream.status) ? null : upstream.body, { status: upstream.status, headers: out })
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE }
