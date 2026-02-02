import { pool } from '@/lib/db';

export type CashflowPlanEvent = {
  id: string;
  date: string;      // YYYY-MM-DD
  amount: number;    // signed (+ income)
  title: string;
  source: 'salary' | 'invoice' | 'recurring' | 'budget_reserve' | 'commission';
  invoiceId?: string;
};

export type CashflowPlanDay = {
  date: string;
  income: number;
  expense: number;
  net: number;
  events: CashflowPlanEvent[];
};

export type CashflowPlanMonthResponse = {
  month: string; // YYYY-MM
  startDate: string;
  endDateExclusive: string;
  totals: {
    income: number;
    expense: number;
    net: number;
  };
  days: CashflowPlanDay[];
};

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
    year: y,
    monthIndex0: m - 1,
  };
}

function lastDayOfMonthUTC(year: number, monthIndex0: number) {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function dateUTC(year: number, monthIndex0: number, day: number) {
  return new Date(Date.UTC(year, monthIndex0, day)).toISOString().slice(0, 10);
}

export async function buildCashflowPlanMonth(params: {
  userId: string;
  month: string;
}): Promise<CashflowPlanMonthResponse> {
  const { userId, month } = params;
  const { startDate, endDateExclusive, year, monthIndex0 } = monthBounds(month);

  const events: CashflowPlanEvent[] = [];

  // Salary (active one)
  const salary = await pool.query(
    `SELECT
       id,
       payout_day,
       net_amount::float8 AS net_amount
     FROM salary_settings
     WHERE user_id = $1 AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  if (salary.rowCount ?? 0 > 0) {
    const s = salary.rows[0] as { id: string; payout_day: number; net_amount: number };
    const last = lastDayOfMonthUTC(year, monthIndex0);
    const d = Math.min(Math.max(s.payout_day, 1), last);
    const dt = dateUTC(year, monthIndex0, d);

    events.push({
      id: `salary:${s.id}:${dt}`,
      date: dt,
      amount: s.net_amount,
      title: 'Gehalt',
      source: 'salary',
    });
  }

  // Invoices planned/sent in this month by expected_payment_date
  const inv = await pool.query(
    `SELECT
       id,
       customer_name,
       expected_payment_date,
       amount::float8 AS amount
     FROM invoices
     WHERE user_id = $1
       AND status IN ('planned','sent')
       AND expected_payment_date >= $2::date
       AND expected_payment_date < $3::date
     ORDER BY expected_payment_date ASC, created_at ASC`,
    [userId, startDate, endDateExclusive],
  );

  for (const r of inv.rows as any[]) {
    events.push({
      id: `invoice:${r.id}`,
      date: r.expected_payment_date,
      amount: r.amount,
      title: r.customer_name ? `Rechnung: ${r.customer_name}` : 'Rechnung',
      source: 'invoice',
      invoiceId: r.id,
    });
  }

  // Build days map
  const dayMap = new Map<string, CashflowPlanDay>();

  // Pre-create all days of month so UI is stable
  const last = lastDayOfMonthUTC(year, monthIndex0);
  for (let d = 1; d <= last; d++) {
    const dt = dateUTC(year, monthIndex0, d);
    dayMap.set(dt, { date: dt, income: 0, expense: 0, net: 0, events: [] });
  }

  for (const e of events) {
    const day = dayMap.get(e.date);
    if (!day) continue; // safety
    day.events.push(e);
    if (e.amount >= 0) day.income += e.amount;
    else day.expense += Math.abs(e.amount);
    day.net += e.amount;
  }

  const days = Array.from(dayMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

  const totals = days.reduce(
    (acc, d) => {
      acc.income += d.income;
      acc.expense += d.expense;
      acc.net += d.net;
      return acc;
    },
    { income: 0, expense: 0, net: 0 },
  );

  return {
    month,
    startDate,
    endDateExclusive,
    totals,
    days,
  };
}
