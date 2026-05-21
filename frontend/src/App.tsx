import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/endpoints'

import AppLayout from '@/layouts/AppLayout'
import ProtectedRoute from '@/layouts/ProtectedRoute'
import SetupPage from '@/pages/SetupPage'
import LandingPage from '@/pages/LandingPage'
import LandingLoginPage from '@/pages/LandingLoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import UsersPage from '@/pages/users/UsersPage'
import NasPage from '@/pages/nas/NasPage'
import GroupsPage from '@/pages/groups/GroupsPage'
import AccountingPage from '@/pages/accounting/AccountingPage'
import TenantsPage from '@/pages/tenants/TenantsPage'
import TenantDetailPage from '@/pages/tenants/TenantDetailPage'
import OwnerAssistantsPage from '@/pages/owner-assistants/OwnerAssistantsPage'
import PlansPage from '@/pages/plans/PlansPage'
import UserDetailPage from '@/pages/users/UserDetailPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import CardsPage from '@/pages/cards/CardsPage'
import TopupsPage from '@/pages/topups/TopupsPage'
import SstpPage from '@/pages/sstp/SstpPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

// 'landing' = main domain (no subdomain / www)
// 'admin'   = admin.delta-group.online  (owner portal)
// 'tenant'  = *.delta-group.online       (ISP tenant portal)
function getAppContext(): 'landing' | 'admin' | 'tenant' {
  const hostname = window.location.hostname
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return 'admin' // raw IP → dev/admin
  const parts = hostname.split('.')
  if (parts.length < 3 || parts[0] === 'www') return 'landing'
  if (parts[0] === 'admin') return 'admin'
  return 'tenant'
}

const APP_CONTEXT = getAppContext()

function SetupGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => authApi.setupStatus().then(r => r.data),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (data?.needsSetup) navigate('/setup', { replace: true })
  }, [data, navigate])

  return <>{children}</>
}

function AuthHydrator({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore(s => s.hydrate)
  useEffect(() => { hydrate() }, [hydrate])
  return <>{children}</>
}

// Shared dashboard routes (used by both admin and tenant contexts).
// `isOwnerSide` = owner OR owner_assistant (cross-tenant management context).
// `isPureOwner` = only the actual platform owner (controls assistant management).
function DashboardRoutes({ isOwnerSide, isPureOwner }: { isOwnerSide: boolean; isPureOwner: boolean }) {
  return (
    <Routes>
      {/* No /login route on subdomains — auth happens on the apex /login.
          ProtectedRoute bounces unauthenticated visitors there. */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:username" element={<UserDetailPage />} />
        <Route path="nas" element={<NasPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="accounting" element={<AccountingPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="cards" element={<CardsPage />} />
        <Route path="topups" element={<TopupsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        {/* Owner-side pages (owner OR owner-assistant with permission) */}
        {isOwnerSide && <Route path="tenants" element={<TenantsPage />} />}
        {isOwnerSide && <Route path="tenants/:id" element={<TenantDetailPage />} />}
        {isOwnerSide && <Route path="sstp" element={<SstpPage />} />}
        {/* Owner-only (assistants cannot manage other assistants) */}
        {isPureOwner && <Route path="owner-assistants" element={<OwnerAssistantsPage />} />}

      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function AdminApp() {
  const user = useAuthStore(s => s.user)
  const isPureOwner = user?.role === 'owner'
  const isOwnerSide = isPureOwner || user?.role === 'owner_assistant'
  return (
    <AuthHydrator>
      <SetupGuard>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="*" element={<DashboardRoutes isOwnerSide={isOwnerSide} isPureOwner={isPureOwner} />} />
        </Routes>
      </SetupGuard>
    </AuthHydrator>
  )
}

function TenantApp() {
  return (
    <AuthHydrator>
      <DashboardRoutes isOwnerSide={false} isPureOwner={false} />
    </AuthHydrator>
  )
}

export default function App() {
  if (APP_CONTEXT === 'landing') {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LandingLoginPage />} />
            <Route path="*"      element={<LandingPage />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {APP_CONTEXT === 'admin' ? <AdminApp /> : <TenantApp />}
      </BrowserRouter>
    </QueryClientProvider>
  )
}
