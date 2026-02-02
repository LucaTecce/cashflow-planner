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
import { Button } from '@/components/ui/button';
import { formatEUR } from '@/lib/money';

type CashflowEvent = {
  date: string;
  kind: "RECURRING" | "BUDGET_RESERVE" | "SALARY" | "INVOICE" | "TX_NORMAL" | "TX_TRANSFER";
  title: string;
  amount: number;
  meta?: Record<string, any>;
};

type DayRow = {
  date: string; // YYYY-MM-DD
  events: CashflowEvent[];
  daySum: number;
  running: number;
};

function mapPlanEvent(e: any): CashflowEvent {
  switch (e.source) {
    case 'salary': return { date: e.date, kind: 'SALARY' as const, title: e.title, amount: e.amount };
    case 'invoice': return { date: e.date, kind: 'INVOICE' as const, title: e.title, amount: e.amount, meta: { invoiceId: e.invoiceId } };
    default: return { date: e.date, kind: 'RECURRING' as const, title: e.title, amount: e.amount };
  }
}

function mapActualEvent(item: any): CashflowEvent {
  if (item.kind === 'transfer') {
    return {
      date: item.date,
      kind: 'TX_TRANSFER' as const,
      title: `${item.title} (${item.legs.length} Legs)`,
      amount: item.net,
      meta: { transferGroupId: item.transferGroupId },
    };
  }
  return {
    date: item.tx.tx_date,
    kind: 'TX_NORMAL' as const,
    title: item.tx.description || item.tx.category || 'Transaction',
    amount: item.tx.amount,
    meta: { invoiceId: item.tx.invoice_id },
  };
}

export default function CashflowPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"PLAN" | "ACTUAL">("PLAN");

  // collapsed-by-default, only one day open (accordion behavior)
  const [openDay, setOpenDay] = useState<string | null>(null);

  async function load(m: string) {
    setLoading(true);
    try {
      const url =
        mode === "PLAN"
          ? `/api/cashflow/plan?month=${encodeURIComponent(m)}`
          : `/api/cashflow/actual?month=${encodeURIComponent(m)}`;

      const r = await fetch(url, { credentials: 'include' }); // NextAuth Session [web:261]
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();

      const mappedDays: DayRow[] = j.days.map((day: any) => ({
        date: day.date,
        events: day.events.map(mode === "PLAN" ? mapPlanEvent : mapActualEvent),
        daySum: day.net,
        running: day.running ?? 0,
      }));

      setDays(mappedDays);
      setOpenDay(null);
    } catch (e: any) {
      console.error(e);
      // your error handling
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(month);
  }, [month, mode]);

  const activeDays = useMemo(() => days.filter((d) => d.events.length > 0), [days]);
  const net = useMemo(() => (days.length ? days[days.length - 1].running : 0), [days]);

  const recurringCount = useMemo(
    () => activeDays.reduce((c, d) => c + d.events.filter((e) => e.kind === 'RECURRING').length, 0),
    [activeDays],
  );
  const salaryCount = useMemo(
    () => activeDays.reduce((c, d) => c + d.events.filter((e) => e.kind === 'SALARY').length, 0),
    [activeDays],
  );
  const invoiceCount = useMemo(
    () => activeDays.reduce((c, d) => c + d.events.filter((e) => e.kind === 'INVOICE').length, 0),
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
          <h1 className="text-2xl font-semibold">
            {mode === "PLAN" ? "Cashflow-Plan" : "Cashflow (Ist)"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "PLAN"
              ? "Prognose (Recurring + Budgets + Salary + Rechnungen). Keine Alltagstransaktionen."
              : "Echte Transaktionen im Monat. Transfers gruppiert."}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-48">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={loading}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {loading ? 'Lade…' : 'Änderung lädt automatisch'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={mode === "PLAN" ? "default" : "outline"}
              onClick={() => setMode("PLAN")}
              disabled={loading}
            >
              Plan
            </Button>
            <Button
              variant={mode === "ACTUAL" ? "default" : "outline"}
              onClick={() => setMode("ACTUAL")}
              disabled={loading}
            >
              Ist
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Netto" value={formatEUR(net)} tone={net < 0 ? 'neg' : 'pos'} />
        <Kpi title="Tage mit Events" value={String(activeDays.length)} />
        <Kpi title="Recurring" value={String(recurringCount)} />
        <Kpi title="Gehalt" value={String(salaryCount)} />
        <Kpi title="Rechnungen" value={String(invoiceCount)} />
        <Kpi title="Budgets" value={String(budgetCount)} />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">Ereignisse</div>
          <div className="text-xs text-muted-foreground">
            Klicke auf einen Tag für Details. {loading && '(lädt)'}
          </div>
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
                  {mode === "PLAN"
                    ? "Keine geplanten Events in diesem Monat."
                    : "Keine Transaktionen in diesem Monat."}
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
                                  {e.kind === "SALARY"
                                    ? "Gehalt"
                                    : e.kind === "INVOICE"
                                      ? "Rechnung"
                                      : e.kind === "TX_TRANSFER"
                                        ? "Transfer"
                                        : e.kind === "RECURRING"
                                          ? "Recurring"
                                          : e.kind === "BUDGET_RESERVE"
                                            ? "Budget"
                                            : "Tx"}
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
