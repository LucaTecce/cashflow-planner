import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

const CreateIncomeProfileSchema = z.object({
  type: z.enum(['employee', 'self_employed']),
  name: z.string().min(1).max(120).default(''),
  isActive: z.boolean().optional(),
  settings: z.object({}).passthrough().optional(),
});

export async function GET() {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const r = await pool.query(
    `SELECT
       id,
       user_id,
       type,
       name,
       settings,
       is_active,
       created_at,
       updated_at
     FROM income_profiles
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [guard.userId],
  );

  return NextResponse.json({ items: r.rows });
}

export async function POST(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const body = await req.json().catch(() => null);
  const parsed = CreateIncomeProfileSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const p = parsed.data;

  const r = await pool.query(
    `INSERT INTO income_profiles (user_id, type, name, settings, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING
       id,
       user_id,
       type,
       name,
       settings,
       is_active,
       created_at,
       updated_at`,
    [guard.userId, p.type, p.name ?? '', p.settings ?? {}, p.isActive ?? true],
  );

  return NextResponse.json({ item: r.rows[0] }, { status: 201 });
}
