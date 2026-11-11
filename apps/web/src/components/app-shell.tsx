import { ROLE_LABELS } from '@alby/shared';
import {
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  ScrollText,
  Sun,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Logo, LogoMark } from '@/components/logo';
import { PageSkeleton } from '@/components/loaders';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { useLogout, useMe } from '@/hooks/use-session';
import { initials } from '@/lib/format';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const MAIN_NAV: NavItem[] = [{ to: '/pazienti', label: 'Pazienti', icon: Users }];
const ADMIN_NAV: NavItem[] = [
  { to: '/admin/utenti', label: 'Utenti', icon: UserCog },
  { to: '/admin/registro', label: 'Registro accessi', icon: ScrollText },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={pathname.startsWith(item.to)} tooltip={item.label}>
                <NavLink to={item.to} onClick={() => setOpenMobile(false)}>
                  <item.icon />
                  <span>{item.label}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserMenu() {
  const me = useMe();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();
  const { setOpenMobile, isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary">
                  {initials(...me.displayName.split(' '))}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{me.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[me.role]}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="grid text-sm leading-tight">
                <span className="truncate font-medium">{me.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{me.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <NavLink to="/profilo" onClick={() => setOpenMobile(false)}>
                <UserRound />
                Profilo e password
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun />
                Tema
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <Sun /> Chiaro
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon /> Scuro
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor /> Automatico
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => logout.mutate()}>
              <LogOut />
              Esci
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppShell() {
  const me = useMe();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <div className="flex h-12 items-center px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <Logo className="group-data-[collapsible=icon]:hidden" />
            <LogoMark className="hidden group-data-[collapsible=icon]:flex" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <NavGroup label="Archivio" items={MAIN_NAV} />
          {me.role === 'ADMIN' && <NavGroup label="Amministrazione" items={ADMIN_NAV} />}
        </SidebarContent>
        <SidebarFooter>
          <UserMenu />
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
        <main className="flex-1 px-4 pb-10 pt-4 md:px-8 md:pt-2">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
