import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

const CreateRuleSchema = z.object({
  profileId: z.string().uuid().nullable().optional(), // self_employed profile or null
  name: z.string().min(1).max(120),
  isActive: z.boolean().default(true),
  ruleJson: z.object({}).passthrough().optional(),
});

export async function GET() {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const r = await pool.query(
    `SELECT
       id,
       user_id,
       profile_id,
       name,
       rule_json,
       is_active,
       created_at,
       updated_at
     FROM commission_rules
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
  const parsed = CreateRuleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const x = parsed.data;

  const r = await pool.query(
    `INSERT INTO commission_rules (user_id, profile_id, name, rule_json, is_active)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING
       id,
       user_id,
       profile_id,
       name,
       rule_json,
       is_active,
       created_at,
       updated_at`,
    [guard.userId, x.profileId ?? null, x.name, x.ruleJson ?? {}, x.isActive],
  );

  return NextResponse.json({ item: r.rows[0] }, { status: 201 });
}
