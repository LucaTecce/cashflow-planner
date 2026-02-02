import { pool } from '@/lib/db';
import type { CashflowEvent } from './types';

/**
 * Returns events for a given month range [startDate, endDateExclusive)
 * startDate/endDateExclusive are YYYY-MM-DD strings.
 */
export async function getIncomePlanEvents(params: {
  userId: string;
  startDate: string;
  endDateExclusive: string;
}): Promise<CashflowEvent[]> {
  const { userId, startDate, endDateExclusive } = params;

  // Salary (employee)
  const salaryRows = await pool.query(
    `SELECT
       ss.id,
       ss.payout_day,
       ss.net_amount::float8 AS net_amount,
       ss.currency
     FROM salary_settings ss
     WHERE ss.user_id = $1 AND ss.is_active = true
     ORDER BY ss.created_at DESC
     LIMIT 1`,
    [userId],
  );

  // Invoices (planned/sent) expected in month window
  const invoiceRows = await pool.query(
    `SELECT
       i.id,
       i.customer_name,
       i.expected_payment_date,
       i.amount::float8 AS amount,
       i.currency,
       i.status
     FROM invoices i
     WHERE i.user_id = $1
       AND i.status IN ('planned','sent')
       AND i.expected_payment_date >= $2::date
       AND i.expected_payment_date < $3::date
     ORDER BY i.expected_payment_date ASC, i.created_at ASC`,
    [userId, startDate, endDateExclusive],
  );

  const events: CashflowEvent[] = [];

  // Salary event: clamp payout day to last day of month in app-layer (simple)
  if (salaryRows.rowCount ?? 0 > 0) {
    const s = salaryRows.rows[0] as { id: string; payout_day: number; net_amount: number; currency: string };

    const start = new Date(`${startDate}T00:00:00Z`);
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth(); // 0-based
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(Math.max(s.payout_day, 1), lastDay);
    const date = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);

    events.push({
      id: `salary:${s.id}:${date}`,
      date,
      amount: s.net_amount, // INCOME => positive
      title: 'Gehalt',
      source: 'salary',
    });
  }

  for (const r of invoiceRows.rows as any[]) {
    // expected_payment_date is date in DB -> comes as string via node-postgres (fine)
    events.push({
      id: `invoice:${r.id}`,
      date: r.expected_payment_date,
      amount: Number(r.amount), // already number due to ::float8
      title: r.customer_name ? `Rechnung: ${r.customer_name}` : 'Rechnung',
      source: 'invoice',
      invoiceId: r.id,
    });
  }

  return events;
}
