'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatEUR } from '@/lib/money';

type PlanEvent = {
  date: string;
  kind: 'RECURRING' | 'BUDGET_RESERVE';
  title: string;
  amount: number;
};

type DayRow = {
  date: string; // YYYY-MM-DD
  events: PlanEvent[];
  daySum: number;
  running: number;
};

export default function CashflowPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);

  // collapsed-by-default, only one day open (accordion behavior)
  const [openDay, setOpenDay] = useState<string | null>(null);

  async function load(m: string) {
    setLoading(true);
    try {
      const r = await fetch(`/api/cashflow/month?month=${encodeURIComponent(m)}`);
      const j = await r.json();
      setDays(j.days ?? []);
      setOpenDay(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const activeDays = useMemo(() => days.filter((d) => d.events.length > 0), [days]);
  const net = useMemo(() => (days.length ? days[days.length - 1].running : 0), [days]);

  const recurringCount = useMemo(
    () => activeDays.reduce((c, d) => c + d.events.filter((e) => e.kind === 'RECURRING').length, 0),
    [activeDays],
  );

  const budgetCount = useMemo(
    () => activeDays.reduce((c, d) => c + d.events.filter((e) => e.kind === 'BUDGET_RESERVE').length, 0),
    [activeDays],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cashflow-Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan-Ebene (Recurring + Budgets). Keine Alltagstransaktionen.
          </p>
        </div>

        <div className="w-48">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">{loading ? 'Lade…' : 'Änderung lädt automatisch'}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Netto (Plan)" value={formatEUR(net)} tone={net < 0 ? 'neg' : 'pos'} />
        <Kpi title="Tage mit Events" value={String(activeDays.length)} />
        <Kpi title="Recurring" value={String(recurringCount)} />
        <Kpi title="Budgets" value={String(budgetCount)} />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">Ereignisse</div>
          <div className="text-xs text-muted-foreground">Klicke auf einen Tag für Details.</div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Tag</TableHead>
              <TableHead>Zusammenfassung / Details</TableHead>
              <TableHead className="w-[140px] text-right">Tag</TableHead>
              <TableHead className="w-[160px] text-right">Running</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {activeDays.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Keine geplanten Events in diesem Monat.
                </TableCell>
              </TableRow>
            ) : (
              activeDays.map((d) => {
                const isOpen = openDay === d.date;
                const toggle = () => setOpenDay((cur) => (cur === d.date ? null : d.date));

                return (
                  <React.Fragment key={d.date}>
                    {/* Day header row */}
                    <TableRow
                      onClick={toggle}
                      className="bg-muted/30 cursor-pointer hover:bg-muted/40"
                    >
                      <TableCell className="font-medium">
                        <span className="mr-2 text-muted-foreground">{isOpen ? '▾' : '▸'}</span>
                        {d.date}
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        Tagessumme · {formatEUR(d.daySum)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({d.events.length} Events)
                        </span>
                      </TableCell>

                      <TableCell className="text-right font-medium tabular-nums">
                        <span className={d.daySum < 0 ? 'text-red-500' : 'text-emerald-600'}>
                          {formatEUR(d.daySum)}
                        </span>
                      </TableCell>

                      <TableCell className="text-right font-medium tabular-nums">
                        {formatEUR(d.running)}
                      </TableCell>
                    </TableRow>

                    {/* Details block as ONE row (no endless table rows) */}
                    {isOpen ? (
                      <TableRow>
                        <TableCell className="py-3">
                          <div className="h-full w-3 border-l-2 border-muted-foreground/20" />
                        </TableCell>

                        <TableCell colSpan={3} className="py-3">
                          <div className="space-y-2">
                            {d.events.map((e, idx) => (
                              <div
                                key={`${d.date}-${idx}`}
                                className="grid grid-cols-[90px_1fr_140px] items-center gap-3 rounded-lg border bg-background px-3 py-2"
                              >
                                <Badge
                                  variant="outline"
                                  className={e.kind === 'RECURRING' ? 'text-muted-foreground' : ''}
                                >
                                  {e.kind === 'RECURRING' ? 'Recurring' : 'Budget'}
                                </Badge>

                                <div className="min-w-0">
                                  <div className="truncate text-sm">{e.title}</div>
                                </div>

                                <div className="text-right tabular-nums">
                                  <span className={e.amount < 0 ? 'text-red-500' : 'text-emerald-600'}>
                                    {formatEUR(e.amount)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Kpi({
               title,
               value,
               tone,
             }: {
  title: string;
  value: string;
  tone?: 'pos' | 'neg';
}) {
  const cls =
    tone === 'neg'
      ? 'text-red-600'
      : tone === 'pos'
        ? 'text-emerald-600'
        : 'text-foreground';

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
