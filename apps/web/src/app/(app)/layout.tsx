import { getLockdownStatus, getMaintenanceStatus } from '@alby/core';
import { ShieldAlert, Wrench } from 'lucide-react';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/logo';
import { ServerModeButton } from '@/components/shell/server-mode-button';
import { NavMenu, type NavItem } from '@/components/shell/nav-menu';
import { UserMenu } from '@/components/shell/user-menu';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { formatDateTime } from '@/lib/format';
import { requirePageUser } from '@/server/context';

const MAIN_NAV: NavItem[] = [
  { href: '/pazienti', label: 'Pazienti', icon: 'users' },
  { href: '/farmaci', label: 'Elenco farmaci', icon: 'pill' },
  { href: '/prestazioni', label: 'Elenco prestazioni', icon: 'stethoscope' },
];
const ADMIN_NAV: NavItem[] = [
  { href: '/admin/utenti', label: 'Utenti', icon: 'userCog' },
  { href: '/admin/tipi-referto', label: 'Tipi di referto', icon: 'template' },
  { href: '/admin/audit-log', label: 'Audit Log', icon: 'scroll' },
  { href: '/admin/impostazioni', label: 'Impostazioni', icon: 'settings' },
];

/** Area riservata: il controllo di accesso avviene qui, sul server, prima di qualsiasi rendering. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePageUser();
  const { user } = ctx;
  const isAdmin = user.role === 'ADMIN';
  // Il blocco accessi lo vedono (e lo usano) solo gli amministratori; l'avviso di manutenzione tutti.
  const [lockdown, maintenance] = await Promise.all([isAdmin ? getLockdownStatus(ctx) : null, getMaintenanceStatus(ctx)]);
  // Lo stato aperto/chiuso della barra laterale è in un cookie: niente "sfarfallio" al caricamento.
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false';

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <div className="flex h-12 items-center px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <Logo className="group-data-[collapsible=icon]:hidden" />
            <LogoMark className="hidden group-data-[collapsible=icon]:flex" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <NavMenu label="Archivio" items={MAIN_NAV} />
          {isAdmin && <NavMenu label="Amministrazione" items={ADMIN_NAV} />}
        </SidebarContent>
        <SidebarFooter>
          {isAdmin && (
            <>
              <ServerModeButton mode="maintenance" state={maintenance} />
              <ServerModeButton mode="lockdown" state={lockdown} />
            </>
          )}
          <UserMenu user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {lockdown && (
          <ModeBanner tone="lockdown" title="RBAC OVERRIDE">
            Accesso sospeso per chi non è amministratore dal {formatDateTime(lockdown.since)}
          </ModeBanner>
        )}
        {maintenance && (
          <ModeBanner tone="maintenance" title={isAdmin ? 'MAINTENANCE MODE' : 'Manutenzione in corso'}>
            {isAdmin
              ? `Modifiche sospese per chi non è amministratore dal ${formatDateTime(maintenance.since)}`
              : 'Puoi consultare i dati ma non modificarli'}
            {maintenance.message && <> · {maintenance.message}</>}
          </ModeBanner>
        )}
        <header
          className={`sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur md:hidden ${lockdown || maintenance ? '' : 'rounded-t-xl'}`}
        >
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <Logo />
        </header>
        <div className="hidden px-4 pt-3 md:block">
          <SidebarTrigger />
        </div>
        <main className="flex-1 px-4 pb-10 pt-4 md:px-8 md:pt-2">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** Barra in cima alle pagine quando è attiva una modalità del server (blocco accessi o manutenzione). */
function ModeBanner({ tone, title, children }: { tone: 'lockdown' | 'maintenance'; title: string; children: ReactNode }) {
  const Icon = tone === 'lockdown' ? ShieldAlert : Wrench;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-center text-xs first:rounded-t-xl ${
        tone === 'lockdown' ? 'bg-destructive text-white' : 'bg-amber-400 text-amber-950 dark:bg-amber-500'
      }`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="font-semibold tracking-wider">{title}</span>
      <span className="opacity-90">{children}</span>
    </div>
  );
}
