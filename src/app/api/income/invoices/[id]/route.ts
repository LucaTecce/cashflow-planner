import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';
import { parseMoneyDE } from '@/lib/money';

const InvoiceStatusSchema = z.enum(['planned', 'sent', 'paid', 'void']);

const AmountSchema = z
  .union([
    z.number(),
    z.string().min(1).transform((s) => parseMoneyDE(s)),
  ])
  .refine((n) => Number.isFinite(n), 'Invalid amount')
  .refine((n) => n > 0, 'Amount must be > 0');

const PatchInvoiceSchema = z.object({
  profileId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().min(0).max(240).optional(),

  amount: AmountSchema,

  currency: z.string().min(3).max(3).optional(),

  serviceDate: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  expectedPaymentDate: z.string().nullable().optional(),

  status: InvoiceStatusSchema.optional(),
  paidAt: z.string().nullable().optional(),

  notes: z.string().max(4000).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = PatchInvoiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;

    if (k === 'profileId') {
      fields.push(`profile_id = $${i++}`);
      values.push(v);
    } else if (k === 'customerId') {
      fields.push(`customer_id = $${i++}`);
      values.push(v);
    } else if (k === 'customerName') {
      fields.push(`customer_name = $${i++}`);
      values.push(v);
    } else if (k === 'serviceDate') {
      fields.push(`service_date = $${i++}`);
      values.push(v);
    } else if (k === 'issuedAt') {
      fields.push(`issued_at = $${i++}`);
      values.push(v);
    } else if (k === 'dueDate') {
      fields.push(`due_date = $${i++}`);
      values.push(v);
    } else if (k === 'expectedPaymentDate') {
      fields.push(`expected_payment_date = $${i++}`);
      values.push(v);
    } else if (k === 'paidAt') {
      fields.push(`paid_at = $${i++}`);
      values.push(v);
    } else {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
  }

  if (fields.length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 });

  values.push(guard.userId, id);

  const r = await pool.query(
    `UPDATE invoices
     SET ${fields.join(', ')}
     WHERE user_id = $${i++} AND id = $${i}
         RETURNING
       id,
       user_id,
       profile_id,
       customer_id,
       customer_name,
       amount::float8 AS amount,
       currency,
       service_date,
       issued_at,
       due_date,
       expected_payment_date,
       status,
       paid_at,
       paid_tx_id,
       notes,
       created_at,
       updated_at`,
    values,
  );

  if (r.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ item: r.rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;

  const r = await pool.query(`DELETE FROM invoices WHERE user_id = $1 AND id = $2`, [
    guard.userId,
    id,
  ]);

  if (r.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
