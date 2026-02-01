'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type StepKey = 'ACCOUNTS' | 'RECURRING' | 'BUDGETS' | 'DONE';

type OnboardingStatus = {
  done: boolean;
  step: StepKey;
  // optional: counts to show feedback
  accountsCount?: number;
  recurringCount?: number;
  budgetsCount?: number;
};

const steps: { key: Exclude<StepKey, 'DONE'>; title: string; desc: string; href: string; cta: string }[] = [
  {
    key: 'ACCOUNTS',
    title: 'Konten anlegen',
    desc: 'Lege mindestens ein Konto an (Privat/Business/Steuer). Optional mit initial_balance.',
    href: '/accounts',
    cta: 'Zu Konten',
  },
  {
    key: 'RECURRING',
    title: 'Fixkosten eintragen',
    desc: 'Lege Recurring-Posten an (Miete, Handy, etc.). Das speist den Cashflow-Plan.',
    href: '/recurring',
    cta: 'Zu Fixkosten',
  },
  {
    key: 'BUDGETS',
    title: 'Budgets definieren',
    desc: 'Plane monatliche Budgets pro Kategorie (optional pro Konto).',
    href: '/budgets',
    cta: 'Zu Budgets',
  },
];

function stepIndex(step: StepKey) {
  if (step === 'DONE') return steps.length;
  return Math.max(0, steps.findIndex((s) => s.key === step));
}

export default function OnboardingPage() {
  const router = useRouter();

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadStatus() {
    setLoading(true);
    try {
      const r = await fetch('/api/onboarding/status', { cache: 'no-store' });
      const j = await r.json();
      setStatus(j);
      if (j?.done || j?.step === 'DONE') {
        router.replace('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const idx = useMemo(() => stepIndex(status?.step ?? 'ACCOUNTS'), [status?.step]);
  const pct = useMemo(() => (steps.length ? Math.round((idx / steps.length) * 100) : 0), [idx]);

  const current = useMemo(() => {
    const key = status?.step ?? 'ACCOUNTS';
    return steps.find((s) => s.key === key) ?? steps[0];
  }, [status?.step]);

  async function skipCurrent() {
    if (!status || status.step === 'DONE') return;
    await fetch('/api/onboarding/skip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: status.step }),
    }).catch(() => null);
    await loadStatus();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Willkommen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Wir richten kurz die Basis ein: Konten → Fixkosten → Budgets.
          </p>
        </div>

        <Button variant="outline" asChild>
          <Link href="/dashboard">Überspringen</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Fortschritt</span>
            <Badge variant="outline">{idx} / {steps.length}</Badge>
          </CardTitle>
          <CardDescription>
            Du kannst jeden Schritt später nachholen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={pct} />
          <div className="text-xs text-muted-foreground">
            {loading ? 'Lade…' : `Aktueller Schritt: ${current.title}`}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{current.title}</CardTitle>
          <CardDescription>{current.desc}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {steps.map((s) => {
              const done = stepIndex(status?.step ?? 'ACCOUNTS') > stepIndex(s.key);
              const active = status?.step === s.key;

              return (
                <div key={s.key} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{s.title}</div>
                    {done ? <Badge variant="secondary">Done</Badge> : active ? <Badge>Aktiv</Badge> : <Badge variant="outline">Offen</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.desc}</div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild className="sm:w-auto">
              <Link href={current.href}>{current.cta}</Link>
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={loadStatus} disabled={loading}>
                Ich bin fertig – prüfen
              </Button>
              <Button variant="ghost" onClick={skipCurrent} disabled={loading}>
                Diesen Schritt überspringen
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Tipp: Nach dem Anlegen einfach zurück hierher kommen und auf „prüfen“ klicken.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
