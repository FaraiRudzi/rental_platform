import Require from '@/components/Require'
import Admin from '@/views/Admin'

export default function Page() {
  return <Require roles={['admin']}><Admin /></Require>
}
