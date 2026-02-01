import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

const PatchRecurringSchema = z.object({
  accountId: z.string().uuid().optional(),
  amount: z.number().finite().optional(),
  description: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(120).optional(),
  intervalType: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  isBusiness: z.boolean().optional(),
  isTaxRelevant: z.boolean().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchRecurringSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  // optional account ownership check
  if (parsed.data.accountId) {
    const acc = await pool.query(`SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2`, [
      parsed.data.accountId,
      guard.userId,
    ]);
    if (acc.rowCount === 0) return NextResponse.json({ error: 'Invalid account' }, { status: 400 });
  }

  const map: Record<string, string> = {
    accountId: 'account_id',
    intervalType: 'interval_type',
    dayOfMonth: 'day_of_month',
    isBusiness: 'is_business',
    isTaxRelevant: 'is_tax_relevant',
    startDate: 'start_date',
    endDate: 'end_date',
  };

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = map[k] ?? k;
    fields.push(`${col} = $${i++}`);
    values.push(v);
  }

  if (fields.length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 });

  values.push(guard.userId, id);

  const r = await pool.query(
    `
        UPDATE recurring
        SET ${fields.join(', ')}
        WHERE user_id = $${i++} AND id = $${i}
            RETURNING
    id,
    account_id,
    amount,
    description,
    category,
    interval_type,
    day_of_month,
    is_business,
    is_tax_relevant,
    start_date::text AS start_date,
    end_date::text AS end_date
    `,
    values,
  );


  if (r.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ item: r.rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;

  const r = await pool.query(`DELETE FROM recurring WHERE user_id = $1 AND id = $2`, [
    guard.userId,
    id,
  ]);
  if (r.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
