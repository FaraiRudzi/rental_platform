import Require from '@/components/Require'
import ListingForm from '@/views/ListingForm'

export default function Page() {
  return <Require roles={['landlord']}><ListingForm /></Require>
}
