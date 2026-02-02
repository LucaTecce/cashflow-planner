import type { ReactNode } from 'react';
import IncomeTabs from './tabs';

export default function IncomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <IncomeTabs />
      <div>{children}</div>
    </div>
  );
}
