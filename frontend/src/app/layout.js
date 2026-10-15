import './globals.css'
import Providers from '@/components/Providers'
import { loadSite } from '@/lib/site-server'

// The branding is read from the backend on every request, so changes in Admin > Settings show up straight away.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const site = await loadSite()
  return {
    title: `${site.site_name} | ${site.company_name}`,
    description: site.tagline,
    icons: { icon: site.logo_icon_url || '/favicon.png' },
  }
}

export const viewport = { themeColor: '#021433', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function RootLayout({ children }) {
  const site = await loadSite()
  return (
    <html lang="en" style={{ '--blue': site.color_primary, '--navy': site.color_dark }}>
      <body>
        <Providers site={site}>{children}</Providers>
      </body>
    </html>
  )
}
