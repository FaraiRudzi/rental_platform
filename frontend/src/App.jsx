import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Search from './pages/Search'
import ListingDetail from './pages/ListingDetail'
import MyDeals from './pages/MyDeals'
import SavedSearches from './pages/SavedSearches'
import LandlordDashboard from './pages/LandlordDashboard'
import ListingForm from './pages/ListingForm'
import Admin from './pages/Admin'
import Notifications from './pages/Notifications'

function Require({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Search />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
        <Route path="/notifications" element={<Require roles={['tenant', 'landlord', 'admin']}><Notifications /></Require>} />

        <Route path="/deals" element={<Require roles={['tenant']}><MyDeals /></Require>} />
        <Route path="/saved" element={<Require roles={['tenant']}><SavedSearches /></Require>} />

        <Route path="/landlord" element={<Require roles={['landlord']}><LandlordDashboard /></Require>} />
        <Route path="/landlord/new" element={<Require roles={['landlord']}><ListingForm /></Require>} />
        <Route path="/landlord/edit/:id" element={<Require roles={['landlord']}><ListingForm /></Require>} />

        <Route path="/admin" element={<Require roles={['admin']}><Admin /></Require>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
