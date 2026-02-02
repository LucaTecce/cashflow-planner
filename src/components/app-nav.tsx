'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

import {
  LayoutDashboard,
  CalendarClock,
  Wallet,
  Repeat,
  PiggyBank,
  ArrowLeftRight,
  Coins,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cashflow", label: "Cashflow-Plan", icon: CalendarClock },
  { href: "/accounts", label: "Konten", icon: Wallet },
  { href: "/recurring", label: "Fixkosten", icon: Repeat },
  { href: "/income", label: "Einnahmen", icon: Coins },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/transactions", label: "Transaktionen", icon: ArrowLeftRight },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/" || pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {nav.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
              <Link href={item.href} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
