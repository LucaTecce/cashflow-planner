import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

const CreateBudgetSchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(120),
  plannedAmount: z.coerce.number().finite().positive(),
  periodType: z.enum(['WEEKLY', 'MONTHLY']),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const url = new URL(req.url);
  const periodStart = url.searchParams.get('periodStart'); // optional filter
  const periodEnd = url.searchParams.get('periodEnd');

  const params: any[] = [guard.userId];
  let where = `b.user_id = $1`;

  if (periodStart) {
    params.push(periodStart);
    where += ` AND b.period_start >= $${params.length}`;
  }
  if (periodEnd) {
    params.push(periodEnd);
    where += ` AND b.period_end <= $${params.length}`;
  }

  const r = await pool.query(
    `
    SELECT
      b.id, b.account_id, a.name as account_name,
      b.name, b.category,
      b.planned_amount::float8 as planned_amount, b.used_amount::float8 as used_amount,
            b.period_type, b.period_start, b.period_end,
      b.created_at, b.updated_at
    FROM budgets b
    LEFT JOIN accounts a ON a.id = b.account_id
    WHERE ${where}
    ORDER BY b.period_start DESC, b.created_at DESC
    `,
    params,
  );

  return NextResponse.json({ items: r.rows });
}

export async function POST(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const body = await req.json().catch(() => null);
  const parsed = CreateBudgetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const b = parsed.data;

  // optional account ownership check
  if (b.accountId) {
    const acc = await pool.query(`SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2`, [
      b.accountId,
      guard.userId,
    ]);
    if (acc.rowCount === 0) return NextResponse.json({ error: 'Invalid account' }, { status: 400 });
  }

  // DB hat CHECK(period_end >= period_start), das ist die letzte Instanz der Datenintegrität
  const r = await pool.query(
    `
    INSERT INTO budgets
      (user_id, account_id, name, category, planned_amount, period_type, period_start, period_end)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING
      id,
      account_id,
      name,
      category,
      planned_amount::float8 as planned_amount,
      used_amount::float8 as used_amount,
      period_type,
      period_start::text as period_start,
      period_end::text as period_end,
      created_at,
      updated_at

    `,
    [
      guard.userId,
      b.accountId ?? null,
      b.name,
      b.category,
      b.plannedAmount,
      b.periodType,
      b.periodStart,
      b.periodEnd,
    ],
  );

  return NextResponse.json({ item: r.rows[0] }, { status: 201 });
}
