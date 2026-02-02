import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;

  const r = await pool.query(`DELETE FROM salary_settings WHERE user_id = $1 AND id = $2`, [
    guard.userId,
    id,
  ]);

  if (r.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
