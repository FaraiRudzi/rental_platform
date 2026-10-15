import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="container" style={{ textAlign: 'center', paddingTop: 80 }}>
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist.</p>
      <Link className="btn" href="/">Back to homes</Link>
    </main>
  )
}
