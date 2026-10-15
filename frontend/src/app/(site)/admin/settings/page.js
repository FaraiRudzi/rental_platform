import Require from '@/components/Require'
import AdminSettings from '@/views/AdminSettings'

export default function Page() {
  return <Require roles={['admin']}><AdminSettings /></Require>
}
