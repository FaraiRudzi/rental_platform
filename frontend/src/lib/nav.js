// Where each role lands after logging in or signing up.
export const home = (role) => (role === 'landlord' ? '/landlord' : role === 'admin' ? '/admin' : '/')

// "?next=/listings/12" sends people back to what they were doing. Only same-site paths are allowed.
export const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : null)
