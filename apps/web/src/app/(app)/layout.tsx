import { getLockdownStatus } from '@alby/core';
import { ShieldAlert } from 'lucide-react';
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
  // Solo gli amministratori vedono (e usano) il bottone del blocco accessi.
  const lockdown = isAdmin ? await getLockdownStatus(ctx) : null;
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
          {isAdmin && <ServerModeButton lockdown={lockdown} />}
          <UserMenu user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {lockdown && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-t-xl bg-destructive px-4 py-1.5 text-center text-xs text-white"
          >
            <ShieldAlert className="size-4 shrink-0" aria-hidden />
            <span className="font-semibold tracking-wider">RBAC OVERRIDE</span>
            <span className="opacity-90">
              Accesso sospeso per chi non è amministratore dal {formatDateTime(lockdown.since)}
            </span>
          </div>
        )}
        <header
          className={`sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur md:hidden ${lockdown ? '' : 'rounded-t-xl'}`}
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
