'use client';

import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import React from 'react';

const pathLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/cashflow': 'Cashflow-Plan',
  '/accounts': 'Konten',
  '/recurring': 'Fixkosten',
  '/budgets': 'Budgets',
  '/transactions': 'Transaktionen',
};

function getBreadcrumb(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = ['Dashboard']; // Home root

  for (const seg of segments) {
    const label = pathLabels[`/${seg}`] || seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push(label);
  }

  return crumbs;
}

export function HeaderContext() {
  const pathname = usePathname();
  const crumbs = getBreadcrumb(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            <BreadcrumbItem>
              <BreadcrumbLink href={idx === 0 ? '/' : `/${crumbs.slice(1, idx + 1).join('/')}`}>
                {crumb}
              </BreadcrumbLink>
            </BreadcrumbItem>
            {idx < crumbs.length - 1 && <BreadcrumbSeparator />}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
