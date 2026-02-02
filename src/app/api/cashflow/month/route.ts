import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

const QuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
});

type PlanEvent = {
  date: string; // YYYY-MM-DD
  kind: 'RECURRING' | 'BUDGET_RESERVE';
  title: string;
  amount: number; // + inflow / - outflow
  meta?: Record<string, any>;
};

function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const parsed = QuerySchema.safeParse({
    month: request.nextUrl.searchParams.get('month'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Query must include month=YYYY-MM' }, { status: 400 });
  }

  const [yearStr, monthStr] = parsed.data.month.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1..12
  const dim = daysInMonth(year, month);

  const monthStart = `${parsed.data.month}-01`;
  const monthEnd = `${parsed.data.month}-${String(dim).padStart(2, '0')}`;

  // 1) Recurring laden (Plan-Ebene)
  const recurringRes = await pool.query(
    `
        SELECT id, amount::float8 as amount, description, category, interval_type, day_of_month,
               start_date::text, end_date::text, account_id
    FROM recurring
    WHERE user_id = $1
      AND start_date <= $3::date
      AND (end_date IS NULL OR end_date >= $2::date)
    `,
    [guard.userId, monthStart, monthEnd],
  );

  // 2) Budgets laden (Plan-Ebene) – wir "reservieren" am period_start
  const budgetsRes = await pool.query(
    `
        SELECT id, name, category, planned_amount::float8 as planned_amount, used_amount::float8 as used_amount,
                period_type, period_start::text, period_end::text, account_id
    FROM budgets
    WHERE user_id = $1
      AND period_start <= $3::date
      AND period_end >= $2::date
    `,
    [guard.userId, monthStart, monthEnd],
  );

  const events: PlanEvent[] = [];

  // Recurring -> Events in diesem Monat erzeugen
  for (const r of recurringRes.rows) {
    if (r.interval_type === 'MONTHLY') {
      const dom: number | null = r.day_of_month;
      if (!dom) continue; // wie abgesprochen: erstmal ok, später optional anders behandeln
      const day = Math.min(dom, dim);
      const date = `${parsed.data.month}-${String(day).padStart(2, '0')}`;
      events.push({
        date,
        kind: 'RECURRING',
        title: r.description,
        amount: r.amount,
        meta: { recurringId: r.id, category: r.category, accountId: r.account_id },
      });
    }

    // MVP-Heuristik:
    // WEEKLY -> jede Woche ab monthStart in 7er Schritten
    if (r.interval_type === 'WEEKLY') {
      const d0 = new Date(monthStart + 'T00:00:00.000Z');
      for (let i = 0; i < 6; i++) {
        const d = new Date(d0);
        d.setUTCDate(d0.getUTCDate() + i * 7);
        const ds = ymd(d);
        if (ds > monthEnd) break;
        events.push({
          date: ds,
          kind: 'RECURRING',
          title: r.description,
          amount: r.amount,
          meta: { recurringId: r.id, category: r.category, accountId: r.account_id },
        });
      }
    }

    // YEARLY -> wenn Startmonat == aktueller Monat, dann einmalig am start_date day
    if (r.interval_type === 'YEARLY') {
      const sd = new Date(r.start_date + 'T00:00:00.000Z');
      const sdMonth = sd.getUTCMonth() + 1;
      if (sdMonth === month) {
        const day = Math.min(sd.getUTCDate(), dim);
        const date = `${parsed.data.month}-${String(day).padStart(2, '0')}`;
        events.push({
          date,
          kind: 'RECURRING',
          title: r.description,
          amount: Number(r.amount),
          meta: { recurringId: r.id, category: r.category, accountId: r.account_id },
        });
      }
    }
  }

  // Budgets -> Reserve-Event am period_start (im Monat)
  for (const b of budgetsRes.rows) {
    const reserve = b.planned_amount;
    const ps = b.period_start; // YYYY-MM-DD

    // Nur Events, die im aktuellen Monat starten
    if (ps.startsWith(parsed.data.month)) {
      events.push({
        date: ps,
        kind: 'BUDGET_RESERVE',
        title: `Budget: ${b.name}`,
        amount: -reserve,
        meta: { budgetId: b.id, category: b.category, accountId: b.account_id ?? null },
      });
    }
  }

  // Sortieren
  events.sort((a, b) => a.date.localeCompare(b.date));

  // Tagesliste bauen + running balance
  const byDate = new Map<string, PlanEvent[]>();
  for (const e of events) {
    byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  }

  let running = 0;
  const days = Array.from({ length: dim }, (_, idx) => {
    const day = idx + 1;
    const date = `${parsed.data.month}-${String(day).padStart(2, '0')}`;
    const ev = byDate.get(date) ?? [];
    const daySum = ev.reduce((s, x) => s + x.amount, 0);
    running += daySum;

    return { date, events: ev, daySum, running };
  });

  return NextResponse.json({
    month: parsed.data.month,
    days,
    totals: {
      recurring: events.filter((e) => e.kind === 'RECURRING').reduce((s, e) => s + e.amount, 0),
      budgetsReserved: events
        .filter((e) => e.kind === 'BUDGET_RESERVE')
        .reduce((s, e) => s + e.amount, 0),
      net: events.reduce((s, e) => s + e.amount, 0),
    },
  });
}
