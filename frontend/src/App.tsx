import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/endpoints'

import AppLayout from '@/layouts/AppLayout'
import ProtectedRoute from '@/layouts/ProtectedRoute'
import LoginPage from '@/pages/LoginPage'
import SetupPage from '@/pages/SetupPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import UsersPage from '@/pages/users/UsersPage'
import NasPage from '@/pages/nas/NasPage'
import GroupsPage from '@/pages/groups/GroupsPage'
import AccountingPage from '@/pages/accounting/AccountingPage'
import TenantsPage from '@/pages/tenants/TenantsPage'
import PlansPage from '@/pages/plans/PlansPage'
import AdminUsersPage from '@/pages/admin-users/AdminUsersPage'
import UserDetailPage from '@/pages/users/UserDetailPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import CardsPage from '@/pages/cards/CardsPage'
import TopupsPage from '@/pages/topups/TopupsPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthHydrator>
          <SetupGuard>
            <Routes>
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/login" element={<LoginPage />} />
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
                <Route path="tenants" element={<TenantsPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="cards" element={<CardsPage />} />
              <Route path="topups" element={<TopupsPage />} />
              <Route path="admin-users" element={<AdminUsersPage />} />
              <Route path="profile" element={<ProfilePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </SetupGuard>
        </AuthHydrator>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
