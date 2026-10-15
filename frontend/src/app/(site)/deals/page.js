import Require from '@/components/Require'
import MyDeals from '@/views/MyDeals'

export default function Page() {
  return <Require roles={['tenant']}><MyDeals /></Require>
}
