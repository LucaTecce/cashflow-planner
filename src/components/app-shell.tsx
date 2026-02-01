import type { ReactNode } from "react";
import Link from "next/link";

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

import { AppNav } from "@/components/app-nav";
import { UserMenu } from "@/components/user-menu"; // client
import { LogoutButton } from "@/components/logout-button";
import { HeaderContext } from '@/components/header-context'; // client

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar variant="sidebar" collapsible="icon" className="border-r bg-card">
        <SidebarHeader className="border-b p-3">
          <div className="truncate text-sm font-semibold">Cashflow Planner</div>
          <div className="truncate text-xs text-muted-foreground">Plan zuerst, Alltag danach</div>
        </SidebarHeader>

        <SidebarContent>
          <AppNav />
        </SidebarContent>

        <SidebarFooter className="border-t p-2">
          <LogoutButton variant="ghost" size="sm" className="w-full justify-start text-xs">
            Logout
          </LogoutButton>
        </SidebarFooter>
      </Sidebar>


      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger />

          <div className="min-w-0 flex-1">
            <HeaderContext />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost">
              <Link href="/transactions">Alltag →</Link>
            </Button>
            <UserMenu />
          </div>
        </header>

        <div className="min-h-[calc(100vh-3.5rem)] bg-background">
          <main className="mx-auto w-full max-w-6xl p-6">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
