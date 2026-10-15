'use client'
import NextLink from 'next/link'

// Same `to` prop the old router used, so existing screens did not need to change.
export default function Link({ to, ...props }) {
  return <NextLink href={to} {...props} />
}
