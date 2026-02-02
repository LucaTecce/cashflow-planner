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

const CreateInvoiceSchema = z.object({
  profileId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().min(0).max(240).optional(),

  amount: AmountSchema,

  currency: z.string().min(3).max(3).default('EUR'),

  serviceDate: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  expectedPaymentDate: z.string().nullable().optional(),

  status: InvoiceStatusSchema.optional(),
  notes: z.string().max(4000).optional(),
});

export async function GET(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const qStatus = status && ['planned', 'sent', 'paid', 'void'].includes(status) ? status : null;

  const r = await pool.query(
    `SELECT
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
       updated_at
     FROM invoices
     WHERE user_id = $1
       AND ($2::text IS NULL OR status = $2::text)
     ORDER BY expected_payment_date NULLS LAST, created_at DESC`,
    [guard.userId, qStatus],
  );

  return NextResponse.json({ items: r.rows });
}

export async function POST(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const body = await req.json().catch(() => null);
  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const i = parsed.data;

  const r = await pool.query(
    `INSERT INTO invoices (
       user_id, profile_id, customer_id, customer_name,
       amount, currency,
       service_date, issued_at, due_date, expected_payment_date,
       status, notes
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
    [
      guard.userId,
      i.profileId ?? null,
      i.customerId ?? null,
      i.customerName ?? '',
      i.amount, // number -> pg will coerce to numeric
      i.currency,
      i.serviceDate ?? null,
      i.issuedAt ?? null,
      i.dueDate ?? null,
      i.expectedPaymentDate ?? null,
      i.status ?? 'planned',
      i.notes ?? '',
    ],
  );

  return NextResponse.json({ item: r.rows[0] }, { status: 201 });
}
