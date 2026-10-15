import Require from '@/components/Require'
import Notifications from '@/views/Notifications'

export default function Page() {
  return <Require roles={['tenant', 'landlord', 'admin']}><Notifications /></Require>
}
