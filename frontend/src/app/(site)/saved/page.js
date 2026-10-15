import Require from '@/components/Require'
import SavedSearches from '@/views/SavedSearches'

export default function Page() {
  return <Require roles={['tenant']}><SavedSearches /></Require>
}
