import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

const MarkPaidSchema = z.object({
  accountId: z.string().uuid(),
  txDate: z.string(), // YYYY-MM-DD
  category: z.string().min(1).max(120).default('Income'),
  description: z.string().min(0).max(240).optional(),
  isBusiness: z.boolean().default(false),
  isTaxRelevant: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id: invoiceId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = MarkPaidSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const p = parsed.data;

  // Use a transaction so we don't end up with "invoice paid but no tx" (or vice versa)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock invoice row
    const inv = await client.query(
      `SELECT
         id,
         user_id,
         status,
         amount::float8 AS amount,
         currency,
         customer_name
       FROM invoices
       WHERE user_id = $1 AND id = $2
       FOR UPDATE`,
      [guard.userId, invoiceId],
    );

    if (inv.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const invoice = inv.rows[0] as {
      id: string;
      user_id: string;
      status: 'planned' | 'sent' | 'paid' | 'void';
      amount: number;
      currency: string;
      customer_name: string;
    };

    if (invoice.status === 'void') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invoice is void' }, { status: 400 });
    }

    if (invoice.status === 'paid') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Already paid' }, { status: 400 });
    }

    const description =
      p.description?.trim() ||
      (invoice.customer_name ? `Invoice payment: ${invoice.customer_name}` : 'Invoice payment');

    // Create transaction (INCOME => positive amount)
    const tx = await client.query(
      `INSERT INTO transactions (
         user_id, account_id,
         amount,
         description, category, tags,
         is_business, is_tax_relevant,
         tx_date,
         invoice_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING
         id,
         user_id,
         account_id,
         amount::float8 AS amount,
         description,
         category,
         tags,
         is_business,
         is_tax_relevant,
         tx_date,
         invoice_id,
         created_at,
         updated_at`,
      [
        guard.userId,
        p.accountId,
        invoice.amount, // positive
        description,
        p.category,
        p.tags,
        p.isBusiness,
        p.isTaxRelevant,
        p.txDate,
        invoiceId,
      ],
    );

    const txRow = tx.rows[0];

    // Update invoice status + paid_at + paid_tx_id
    const upd = await client.query(
      `UPDATE invoices
       SET status = 'paid',
           paid_at = $1,
           paid_tx_id = $2
       WHERE user_id = $3 AND id = $4
       RETURNING
         id,
         user_id,
         status,
         amount::float8 AS amount,
         paid_at,
         paid_tx_id,
         updated_at`,
      [p.txDate, txRow.id, guard.userId, invoiceId],
    );

    await client.query('COMMIT');

    return NextResponse.json({ invoice: upd.rows[0], transaction: txRow }, { status: 201 });
  } catch (_e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
