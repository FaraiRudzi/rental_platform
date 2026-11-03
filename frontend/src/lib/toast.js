// A tiny message bus: any code (including the shared hooks) can show a success or error message
// at the corner of the screen without extra wiring. <ToastHost /> in Providers displays them.
function emit(type, message) {
  if (typeof window !== 'undefined' && message) window.dispatchEvent(new CustomEvent('rp:toast', { detail: { type, message } }))
}
export const toast = {
  success: (message) => emit('success', message),
  error: (message) => emit('error', message),
  info: (message) => emit('info', message),
}
