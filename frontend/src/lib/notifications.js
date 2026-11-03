// How each kind of alert looks (icon and colour) and where it should take you.
const META = {
  application_received: ['user', 'blue'], application_accepted: ['check', 'ok'], application_rejected: ['x', 'bad'],
  application_withdrawn: ['alert', 'warn'], acceptance_declined: ['alert', 'warn'], acceptance_expired: ['clock', 'warn'],
  placement_confirmed: ['dollar', 'blue'], payment_received: ['dollar', 'ok'], payment_reversed: ['dollar', 'warn'],
  fee_adjusted: ['dollar', 'warn'], fee_waived: ['dollar', 'ok'], contacts_released: ['phone', 'ok'], placement_cancelled: ['x', 'bad'],
  enquiry_received: ['message', 'blue'], enquiry_replied: ['message', 'ok'], viewing_requested: ['calendar', 'blue'], viewing_updated: ['calendar', 'ok'],
  listing_pending_review: ['home', 'warn'], listing_approved: ['home', 'ok'], listing_rejected: ['home', 'bad'],
  verification_pending: ['shield', 'warn'], document_approved: ['shield', 'ok'], document_rejected: ['shield', 'bad'], verification_updated: ['shield', 'blue'],
  saved_search_match: ['search', 'blue'],
}
export const eventMeta = (event) => { const [icon, tone] = META[event] || ['bell', 'blue']; return { icon, tone } }

export function targetFor(n, role) {
  const landlord = role === 'landlord'
  switch (n.event) {
    case 'listing_pending_review': return '/admin?tab=listings'
    case 'verification_pending': return '/admin?tab=verification'
    case 'document_approved': case 'document_rejected': case 'verification_updated': return '/verification'
    case 'application_received': case 'application_withdrawn': return '/landlord'
    case 'enquiry_received': return '/landlord?tab=enquiries'
    case 'viewing_requested': return '/landlord?tab=viewings'
    case 'listing_approved': case 'listing_rejected': return '/landlord?tab=listings'
    case 'saved_search_match': return n.related_id ? `/listings/${n.related_id}` : '/'
    case 'application_accepted': case 'application_rejected': case 'acceptance_expired': case 'acceptance_declined':
    case 'placement_confirmed': case 'contacts_released': case 'payment_received': case 'payment_reversed':
    case 'fee_adjusted': case 'fee_waived': case 'placement_cancelled':
      return landlord ? '/landlord?tab=deals' : '/deals'
    case 'enquiry_replied': case 'viewing_updated': return '/'
    default: return null
  }
}
