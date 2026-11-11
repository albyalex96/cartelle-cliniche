import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ServerCrash } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { AppShell } from '@/components/app-shell';
import { FullScreenLoader } from '@/components/loaders';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useMe } from '@/hooks/use-session';
import { errorMessage } from '@/lib/api';
import { meQuery, setupStatusQuery } from '@/lib/query';

// Ogni pagina viene scaricata solo quando serve.
const SetupPage = lazy(() => import('@/pages/auth/setup-page'));
const LoginPage = lazy(() => import('@/pages/auth/login-page'));
const ForcePasswordPage = lazy(() => import('@/pages/auth/force-password-page'));
const PatientsPage = lazy(() => import('@/pages/patients/patients-page'));
const PatientDetailPage = lazy(() => import('@/pages/patients/patient-detail-page'));
const UsersPage = lazy(() => import('@/pages/admin/users-page'));
const AuditPage = lazy(() => import('@/pages/admin/audit-page'));
const ProfilePage = lazy(() => import('@/pages/profile-page'));
const NotFoundPage = lazy(() => import('@/pages/not-found-page'));

/** Decide cosa mostrare: configurazione iniziale, login, cambio password o l'app. */
function SessionGate() {
  const setup = useQuery(setupStatusQuery);
  const me = useQuery(meQuery);

  if (setup.isPending || me.isPending) return <FullScreenLoader />;

  if (setup.isError || me.isError) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ServerCrash />
            </EmptyMedia>
            <EmptyTitle>Server non raggiungibile</EmptyTitle>
            <EmptyDescription>{errorMessage(setup.error ?? me.error)}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => {
                void setup.refetch();
                void me.refetch();
              }}
            >
              <RefreshCw />
              Riprova
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const content = setup.data.needsSetup ? (
    <SetupPage />
  ) : !me.data ? (
    <LoginPage />
  ) : me.data.mustChangePassword ? (
    <ForcePasswordPage />
  ) : (
    <Outlet />
  );
  return <Suspense fallback={<FullScreenLoader />}>{content}</Suspense>;
}

function AdminOnly() {
  const me = useMe();
  return me.role === 'ADMIN' ? <Outlet /> : <Navigate to="/pazienti" replace />;
}

export const router = createBrowserRouter([
  {
    element: <SessionGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/pazienti" replace /> },
          { path: 'pazienti', element: <PatientsPage /> },
          { path: 'pazienti/:id', element: <PatientDetailPage /> },
          { path: 'profilo', element: <ProfilePage /> },
          {
            path: 'admin',
            element: <AdminOnly />,
            children: [
              { index: true, element: <Navigate to="/admin/utenti" replace /> },
              { path: 'utenti', element: <UsersPage /> },
              { path: 'registro', element: <AuditPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
