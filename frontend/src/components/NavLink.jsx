'use client'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'

// A link that gets the class "active" on the page you are on.
export default function NavLink({ to, end = false, className = '', children, ...props }) {
  const pathname = usePathname() || ''
  const active = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
  return <NextLink href={to} className={`${className} ${active ? 'active' : ''}`.trim()} {...props}>{children}</NextLink>
}
