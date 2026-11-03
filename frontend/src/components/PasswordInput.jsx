'use client'
import { useState } from 'react'
import Icon from './Icons'
import IconInput from './IconInput'

// Password box with a lock icon and an eye button to show or hide what you typed.
export default function PasswordInput({ icon = 'lock', ...props }) {
  const [show, setShow] = useState(false)
  return (
    <IconInput icon={icon} {...props} type={show ? 'text' : 'password'}
      right={<button type="button" className="ii-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}><Icon name={show ? 'eyeOff' : 'eye'} size={18} /></button>} />
  )
}
