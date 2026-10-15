import Require from '@/components/Require'
import Verification from '@/views/Verification'

export default function Page() {
  return <Require roles={['tenant', 'landlord']}><Verification /></Require>
}
