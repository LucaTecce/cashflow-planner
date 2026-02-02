'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { Money } from '@/components/money';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';

type OnboardingStatus = {
  done: boolean;
  step: 'ACCOUNTS' | 'RECURRING' | 'BUDGETS' | 'DONE';
};

type AccountBalanceRow = {
  id: string;
  name: string;
  type: 'PRIVATE' | 'BUSINESS' | 'TAX';
  color: string | null;
  iban: string | null;
  initial_balance: number;
  movement: number;
  balance: number;
};

type TxItem = {
  kind: 'NORMAL' | 'TRANSFER';
  id: string | null;
  transfer_group_id: string | null;
  tx_date: string;
  description: string;
  category: string | null;
  amount: number;
  is_business: boolean;
  is_tax_relevant: boolean;
  account_id: string | null;
  account_name: string | null;
  from_account_name: string | null;
  to_account_name: string | null;
};

type BudgetOverview = {
  id: string;
  name: string;
  category: string;
  planned_amount: number;
  used_amount: number;
  account_id: string | null;
  account_name: string | null;
  period_start: string;
  period_end: string;
};

function yyyymm(date: Date) {
  return date.toISOString().slice(0, 7);
}

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function clampPct(x: number) {
  return Math.max(0, Math.min(100, x));
}

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<AccountBalanceRow[]>([]);
  const [txs, setTxs] = useState<TxItem[]>([]);
  const [budgets, setBudgets] = useState<BudgetOverview[]>([]);
  const [cashflowNet, setCashflowNet] = useState<number>(0);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const month = yyyymm(new Date());

      const [aRes, tRes, bRes, cRes, oRes] = await Promise.all([
        fetch('/api/accounts/balances'),
        fetch('/api/transactions'),
        fetch('/api/budgets/overview'),
        fetch(`/api/cashflow/month?month=${encodeURIComponent(month)}`),
        fetch('/api/onboarding/status', { cache: 'no-store' }),
      ]);

      const [aJson, tJson, bJson, cJson, oJson] = await Promise.all([
        aRes.json(),
        tRes.json(),
        bRes.json(),
        cRes.json(),
        oRes.json(),
      ]);

      setAccounts(aJson.items ?? []);
      setTxs((tJson.items ?? []).slice(0, 10));
      setBudgets((bJson.items ?? []).slice(0, 8));
      setOnboarding(oJson ?? null);

      const days = cJson.days ?? [];
      const net = days.length ? n(days[days.length - 1].running) : 0;
      setCashflowNet(net);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const totals = useMemo(() => {
    const total = sum(accounts.map((a) => a.balance));
    const priv = sum(accounts.filter((a) => a.type === 'PRIVATE').map((a) => n(a.balance)));
    const biz = sum(accounts.filter((a) => a.type === 'BUSINESS').map((a) => n(a.balance)));
    const tax = sum(accounts.filter((a) => a.type === 'TAX').map((a) => n(a.balance)));
    return { total, priv, biz, tax };
  }, [accounts]);

  const budgetStats = useMemo(() => {
    const parsed = budgets.map((b) => ({ ...b, planned: b.planned_amount, used: b.used_amount }));
    const over = parsed.filter((b) => b.planned > 0 && b.used > b.planned).length;
    const near = parsed.filter((b) => b.planned > 0 && b.used / b.planned >= 0.9 && b.used <= b.planned).length;
    return { parsed, over, near };
  }, [budgets]);

  const onboardingLabel =
    onboarding?.step === 'ACCOUNTS'
      ? 'Konten anlegen'
      : onboarding?.step === 'RECURRING'
        ? 'Fixkosten eintragen'
        : onboarding?.step === 'BUDGETS'
          ? 'Budgets definieren'
          : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Status, Plan und nächste Schritte – ohne viel Scrollen."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/transactions">Transaktionen</Link>
            </Button>
            <Button asChild>
              <Link href="/budgets">Budgets</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <KpiMoney title="Kontostand (gesamt)" value={totals.total} tone={totals.total < 0 ? 'neg' : 'pos'} />
        <KpiMoney title="Privat" value={totals.priv} />
        <KpiMoney title="Business" value={totals.biz} />
        <KpiMoney title="Plan-Netto (Monat)" value={cashflowNet} tone={cashflowNet < 0 ? 'neg' : 'pos'} />
      </div>

      {onboarding && !onboarding.done && onboarding.step !== 'DONE' && onboardingLabel ? (
        <Alert>
          <AlertTitle>Setup noch nicht fertig</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Nächster Schritt: <span className="font-medium">{onboardingLabel}</span>
            </span>

            <div className="flex items-center gap-2">
              <Button asChild>
                <Link href="/onboarding">Setup fortsetzen</Link>
              </Button>
              <Button variant="outline" onClick={load} disabled={loading}>
                Aktualisieren
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Budgets (Top)" description={`${budgetStats.over} over · ${budgetStats.near} nahe Limit`}>
          <div className="space-y-3">
            {budgetStats.parsed.length === 0 ? (
              <div className="text-sm text-muted-foreground">Keine Budgets vorhanden.</div>
            ) : (
              budgetStats.parsed.map((b) => {
                const pct = b.planned > 0 ? (b.used / b.planned) * 100 : 0;
                const over = b.planned > 0 && b.used > b.planned;

                return (
                  <div key={b.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{b.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {b.category} · {b.account_name ?? 'Alle'}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm tabular-nums">
                          <span className={over ? 'text-red-600' : ''}>
                            <Money value={b.used} /> / <Money value={b.planned} />
                          </span>
                        </div>
                        <div className="mt-1 flex justify-end">
                          {over ? <Badge variant="destructive">Over</Badge> : <Badge variant="outline">{Math.round(pct)}%</Badge>}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Progress value={clampPct(pct)} />
                    </div>
                  </div>
                );
              })
            )}

            <Button asChild variant="outline" className="w-full" disabled={loading}>
              <Link href="/budgets">Zu den Budgets</Link>
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Konten" description="Saldo = initial_balance + movement">
          <div className="space-y-2">
            {accounts.length === 0 ? (
              <div className="text-sm text-muted-foreground">Keine Konten vorhanden.</div>
            ) : (
              accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.type}
                      {a.iban ? ` · ${a.iban}` : ''}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <Money value={n(a.balance)} />
                  </div>
                </div>
              ))
            )}

            <Button asChild variant="outline" className="w-full">
              <Link href="/accounts">Konten verwalten</Link>
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Letzte Buchungen" description="Schnell prüfen & korrigieren.">
          <div className="space-y-2">
            {txs.length === 0 ? (
              <div className="text-sm text-muted-foreground">Keine Transaktionen gefunden.</div>
            ) : (
              txs.map((t, idx) => {
                const amountN = t.amount;
                const subtitle =
                  t.kind === 'TRANSFER'
                    ? `${t.tx_date} · ${t.from_account_name ?? '—'} → ${t.to_account_name ?? '—'}`
                    : `${t.tx_date} · ${t.account_name ?? '—'}`;

                return (
                  <div key={`${t.kind}-${t.transfer_group_id ?? t.id ?? idx}`} className="rounded-lg border px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t.description}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {subtitle}
                          {t.category ? ` · ${t.category}` : ''}
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <span className={amountN < 0 ? 'text-red-600' : 'text-emerald-600'}>
                          <Money value={amountN} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <Button asChild variant="outline" className="w-full">
              <Link href="/transactions">Alle Transaktionen</Link>
            </Button>
          </div>
        </SectionCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hinweis</CardTitle>
          <CardDescription>Kontosalden kommen serverseitig aus initial_balance + SUM(transactions.amount).</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Dadurch stimmen die Salden auch bei Transfers (OUT/IN Legs) konsistent.
        </CardContent>
      </Card>
    </div>
  );
}

function KpiMoney({
                    title,
                    value,
                    tone,
                  }: {
  title: string;
  value: number;
  tone?: 'pos' | 'neg';
}) {
  const cls =
    tone === 'neg'
      ? 'text-red-600'
      : tone === 'pos'
        ? 'text-emerald-600'
        : 'text-foreground';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className={`text-2xl tabular-nums ${cls}`}>
          <Money value={value} />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0" />
    </Card>
  );
}
