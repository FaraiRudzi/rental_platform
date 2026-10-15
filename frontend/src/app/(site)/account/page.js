import Require from '@/components/Require'
import Account from '@/views/Account'

export default function Page() {
  return <Require roles={['tenant', 'landlord', 'admin']}><Account /></Require>
}
