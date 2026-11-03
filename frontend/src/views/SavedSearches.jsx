'use client'
import Icon from '@/components/Icons'
import { useConfirm } from '@/components/ConfirmDialog'
import Link from '@/components/Link'
import ListingCard from '@/components/ListingCard'
import { Alert, EmptyState, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import { toast } from '@/lib/toast'

const label = { area: 'Area', min_rent: 'From', max_rent: 'Up to', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', type: 'Type', furnishing: 'Furnishing', amenities: 'Features', verified: 'Verified only', available_by: 'Available by', q: 'Keyword' }

export default function SavedSearches() {
  const searches = useFetch('/me/saved-searches/')
  const homes = useFetch('/me/favourites/')
  const confirm = useConfirm()

  const removeHome = async (l) => {
    if (!(await confirm({ title: 'Remove from saved homes?', message: `“${l.title}” will be removed from your saved homes.`, confirmLabel: 'Remove', tone: 'danger' }))) return
    try { await api(`/listings/${l.id}/favourite/`, { method: 'DELETE' }); homes.reload(); toast.success('Removed from your saved homes.') } catch (e) { toast.error(e.message) }
  }
  const removeSearch = async (s) => {
    if (!(await confirm({ title: 'Delete this saved search?', message: 'You will stop getting alerts for it.', confirmLabel: 'Delete', cancelLabel: 'Keep it', tone: 'danger' }))) return
    try { await api(`/me/saved-searches/${s.id}/`, { method: 'DELETE' }); searches.reload(); toast.success('Saved search deleted.') } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="stack">
      <PageHeader title="Saved homes and searches" subtitle="Homes you liked, and searches we alert you about." />
      <Alert error={homes.error || searches.error} />

      <section className="sect">
        <h2>Saved homes</h2>
        {homes.data?.length === 0 && <EmptyState icon="heart" title="No saved homes yet">Tap the heart on any home to keep it here. <Link to="/">Find a home</Link></EmptyState>}
        <div className="pgrid grid">{homes.data?.map((l) => <ListingCard key={l.id} l={l} saved onSave={removeHome} />)}</div>
      </section>

      <section className="sect">
        <h2>Saved searches</h2>
        {searches.data?.length === 0 && <EmptyState icon="bell" title="No saved searches">Use &quot;Alert me about new homes&quot; on the search page. <Link to="/">Search homes</Link></EmptyState>}
        {searches.data?.map((s) => (
          <div className="card row between wrap" key={s.id}>
            <div>
              <strong>{s.name || 'Search'}</strong>
              <div className="fchips" style={{ marginTop: 6 }}>
                {Object.entries(s.filters || {}).filter(([k]) => label[k]).map(([k, v]) => <span key={k} className="chip">{label[k]}: {String(v).replace(/,/g, ', ')}</span>)}
                {Object.keys(s.filters || {}).length === 0 && <span className="chip">All homes</span>}
              </div>
            </div>
            <div className="row gap">
              <Link className="btn sm" to={`/?${new URLSearchParams(s.filters)}`}><Icon name="search" size={14} /> Run</Link>
              <button className="btn danger sm" onClick={() => removeSearch(s)}><Icon name="trash" size={14} /> Delete</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
