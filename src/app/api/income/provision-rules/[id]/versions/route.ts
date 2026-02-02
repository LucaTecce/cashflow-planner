import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

function toDateRangeLiteral(from: string, to: string | null) {
  // canonical: inclusive lower [, exclusive upper ) (Postgres ranges)
  // open-ended: "[2026-01-01,)" [web:201]
  const end = to ? `${to}` : '';
  return `[${from},${end})`;
}

const CreateVersionSchema = z.object({
  validFrom: z.string().min(1), // YYYY-MM-DD
  validTo: z.string().min(1).nullable().optional(), // YYYY-MM-DD or null => open end
  ruleJson: z.object({}).passthrough().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id: commissionRuleId } = await ctx.params;

  // Ensure user owns the rule
  const own = await pool.query(
    `SELECT 1 FROM commission_rules WHERE user_id = $1 AND id = $2`,
    [guard.userId, commissionRuleId],
  );
  if (own.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const r = await pool.query(
    `SELECT
       id,
       user_id,
       commission_rule_id,
       valid_period::text AS valid_period,
       rule_json,
       created_at,
       updated_at
     FROM commission_rule_versions
     WHERE user_id = $1 AND commission_rule_id = $2
     ORDER BY lower(valid_period) DESC`,
    [guard.userId, commissionRuleId],
  );

  return NextResponse.json({ items: r.rows });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id: commissionRuleId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = CreateVersionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  // Ensure user owns the rule
  const own = await pool.query(
    `SELECT 1 FROM commission_rules WHERE user_id = $1 AND id = $2`,
    [guard.userId, commissionRuleId],
  );
  if (own.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const v = parsed.data;
  const rangeLiteral = toDateRangeLiteral(v.validFrom, v.validTo ?? null);

  // Overlaps are prevented by exclusion constraint; on conflict this will error.
  const r = await pool.query(
    `INSERT INTO commission_rule_versions (user_id, commission_rule_id, valid_period, rule_json)
     VALUES ($1, $2, $3::daterange, $4)
     RETURNING
       id,
       user_id,
       commission_rule_id,
       valid_period::text AS valid_period,
       rule_json,
       created_at,
       updated_at`,
    [guard.userId, commissionRuleId, rangeLiteral, v.ruleJson ?? {}],
  );

  return NextResponse.json({ item: r.rows[0] }, { status: 201 });
}
