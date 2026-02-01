import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';
import { electronicFormat, isValid as isValidIban } from "iban";

const PatchAccountSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(['PRIVATE', 'BUSINESS', 'TAX']).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  initialBalance: z.number().finite().optional(),
  iban: z
    .string()
    .transform((v) => electronicFormat(v)) // [web:117]
    .refine((v) => isValidIban(v), "Invalid IBAN") // [web:117]
    .optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchAccountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  // Dynamisches Update ohne SQL-Injection: wir bauen param-gebunden
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (k === 'initialBalance') {
      fields.push(`initial_balance = $${i++}`);
      values.push(v);
    } else {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
  }

  if (fields.length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 });

  values.push(guard.userId, id);

  const r = await pool.query(
    `UPDATE accounts
     SET ${fields.join(', ')}
     WHERE user_id = $${i++} AND id = $${i}
     RETURNING id, name, type, color, initial_balance, iban, created_at, updated_at`,
    values,
  );

  if (r.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ item: r.rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;

  const r = await pool.query(`DELETE FROM accounts WHERE user_id = $1 AND id = $2`, [
    guard.userId,
    id,
  ]);

  if (r.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
