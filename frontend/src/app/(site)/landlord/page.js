import Require from '@/components/Require'
import LandlordDashboard from '@/views/LandlordDashboard'

export default function Page() {
  return <Require roles={['landlord']}><LandlordDashboard /></Require>
}
