import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/logo';
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
import { requirePageUser } from '@/server/context';

const MAIN_NAV: NavItem[] = [{ href: '/pazienti', label: 'Pazienti', icon: 'users' }];
const ADMIN_NAV: NavItem[] = [
  { href: '/admin/utenti', label: 'Utenti', icon: 'userCog' },
  { href: '/admin/registro', label: 'Registro accessi', icon: 'scroll' },
];

/** Area riservata: il controllo di accesso avviene qui, sul server, prima di qualsiasi rendering. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requirePageUser();
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
          {user.role === 'ADMIN' && <NavMenu label="Amministrazione" items={ADMIN_NAV} />}
        </SidebarContent>
        <SidebarFooter>
          <UserMenu user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 rounded-t-xl border-b bg-background/80 px-3 backdrop-blur md:hidden">
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
