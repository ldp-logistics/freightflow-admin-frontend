import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Redirect, Route, Switch } from 'wouter'
import { AppShell } from './components/AppShell'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { EmailsPage } from './pages/EmailsPage'
import { HubPage, HubRegisterPage, HubShipmentDetailPage } from './pages/HubPage'
import { LoginPage } from './pages/LoginPage'
import { MicrosoftCallbackPage } from './pages/MicrosoftCallbackPage'
import { MissingMblPage } from './pages/MissingMblPage'
import { OrganizationsPage } from './pages/OrganizationsPage'
import { OverviewPage } from './pages/OverviewPage'
import { PlatformShipmentsPage } from './pages/PlatformShipmentsPage'
import { PlatformShipmentDetailPage } from './pages/PlatformShipmentDetailPage'
import { PlatformContainersPage } from './pages/PlatformContainersPage'
import { RoutingPage } from './pages/RoutingPage'
import { SettingsPage } from './pages/SettingsPage'
import { UsersPage } from './pages/UsersPage'
import { UserActivityPage } from './pages/UserActivityPage'
import { WorkspacePage } from './pages/WorkspacePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
        Loading…
      </div>
    )
  }
  if (!user) return <Redirect to="/login" />
  return <AppShell>{children}</AppShell>
}

function Routes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/auth/microsoft/callback" component={MicrosoftCallbackPage} />
      <Route path="/settings">
        <RequireAuth>
          <SettingsPage />
        </RequireAuth>
      </Route>
      <Route path="/organizations">
        <RequireAuth>
          <OrganizationsPage />
        </RequireAuth>
      </Route>
      <Route path="/workspace">
        <RequireAuth>
          <WorkspacePage />
        </RequireAuth>
      </Route>
      <Route path="/users">
        <RequireAuth>
          <UsersPage />
        </RequireAuth>
      </Route>
      <Route path="/user-activity">
        <RequireAuth>
          <UserActivityPage />
        </RequireAuth>
      </Route>
      <Route path="/shipments/:id">
        <RequireAuth>
          <PlatformShipmentDetailPage />
        </RequireAuth>
      </Route>
      <Route path="/shipments">
        <RequireAuth>
          <PlatformShipmentsPage />
        </RequireAuth>
      </Route>
      <Route path="/containers">
        <RequireAuth>
          <PlatformContainersPage />
        </RequireAuth>
      </Route>
      <Route path="/approvals">
        <RequireAuth>
          <ApprovalsPage />
        </RequireAuth>
      </Route>
      <Route path="/missing-mbl">
        <RequireAuth>
          <MissingMblPage />
        </RequireAuth>
      </Route>
      <Route path="/routing">
        <RequireAuth>
          <RoutingPage />
        </RequireAuth>
      </Route>
      <Route path="/hub/shipments/new">
        <RequireAuth>
          <HubRegisterPage />
        </RequireAuth>
      </Route>
      <Route path="/hub/shipments/:id">
        <RequireAuth>
          <HubShipmentDetailPage />
        </RequireAuth>
      </Route>
      <Route path="/hub">
        <RequireAuth>
          <HubPage />
        </RequireAuth>
      </Route>
      <Route path="/emails">
        <RequireAuth>
          <EmailsPage />
        </RequireAuth>
      </Route>
      <Route path="/">
        <RequireAuth>
          <OverviewPage />
        </RequireAuth>
      </Route>
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </QueryClientProvider>
  )
}
