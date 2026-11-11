'use client';

import { ScrollText, UserCog, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

// Le icone sono funzioni e non possono passare dal server al client: si indicano per nome.
const ICONS = { users: Users, userCog: UserCog, scroll: ScrollText } satisfies Record<string, LucideIcon>;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

/** Client solo perché deve sapere quale voce è attiva e chiudere il menu su mobile. */
export function NavMenu({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)} tooltip={item.label}>
                  <Link href={item.href} onClick={() => setOpenMobile(false)}>
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
