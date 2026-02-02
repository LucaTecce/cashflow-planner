'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const tabs = [
  { value: 'invoices', label: 'Rechnungen', href: '/income/invoices' },
  { value: 'salary', label: 'Gehalt', href: '/income/salary' },
  { value: 'provision', label: 'Provision', href: '/income/provision' },
] as const;

function tabFromPath(pathname: string) {
  if (pathname.startsWith('/income/salary')) return 'salary';
  if (pathname.startsWith('/income/provision')) return 'provision';
  return 'invoices';
}

export default function IncomeTabs() {
  const pathname = usePathname();
  const active = tabFromPath(pathname);

  return (
    <div className="space-y-2">
      <div>
        <h1 className="text-xl font-semibold">Einnahmen</h1>
        <p className="text-sm text-muted-foreground">
          Pflege hier deine Einkommensquellen für den Plan (Forecast).
        </p>
      </div>

      <Tabs value={active}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} asChild>
              <Link href={t.href}>{t.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
