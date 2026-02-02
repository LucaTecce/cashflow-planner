import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

const PatchIncomeProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  settings: z.object({}).passthrough().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = PatchIncomeProfileSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (k === 'isActive') {
      fields.push(`is_active = $${i++}`);
      values.push(v);
    } else {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
  }

  if (fields.length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 });

  values.push(guard.userId, id);

  const r = await pool.query(
    `UPDATE income_profiles
     SET ${fields.join(', ')}
     WHERE user_id = $${i++} AND id = $${i}
     RETURNING
       id,
       user_id,
       type,
       name,
       settings,
       is_active,
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

  const r = await pool.query(`DELETE FROM income_profiles WHERE user_id = $1 AND id = $2`, [
    guard.userId,
    id,
  ]);

  if (r.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
