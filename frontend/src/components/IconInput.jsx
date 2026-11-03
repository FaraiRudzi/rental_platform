'use client'
import Icon from './Icons'

// A text input with a small icon on the left (and an optional element on the right).
export default function IconInput({ icon, right = null, className = '', ...props }) {
  return (
    <div className={`iconinput ${className}`}>
      <span className="ii-icon"><Icon name={icon} size={18} /></span>
      <input {...props} />
      {right}
    </div>
  )
}
