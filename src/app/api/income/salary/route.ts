import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';
import { parseMoneyDE } from '@/lib/money';

const AmountSchema = z
  .union([z.number(), z.string().min(1).transform((s) => parseMoneyDE(s))])
  .refine((n) => Number.isFinite(n), 'Invalid amount');

const CreateOrUpdateSalarySchema = z.object({
  profileId: z.string().uuid(), // should be employee profile id
  netAmount: AmountSchema.refine((n) => n > 0, 'Net must be > 0'),
  grossAmount: AmountSchema.refine((n) => n > 0, 'Gross must be > 0').nullable().optional(),

  payoutDay: z.number().int().min(1).max(31),

  yearlyBonusAmount: AmountSchema.refine((n) => n > 0, 'Bonus must be > 0').nullable().optional(),
  yearlyBonusMonth: z.number().int().min(1).max(12).nullable().optional(),
  yearlyBonusDay: z.number().int().min(1).max(31).nullable().optional(),

  currency: z.string().min(3).max(3).default('EUR'),
  isActive: z.boolean().default(true),
});

export async function GET() {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const r = await pool.query(
    `SELECT
       id,
       user_id,
       profile_id,
       net_amount::float8 AS net_amount,
       gross_amount::float8 AS gross_amount,
       payout_day,
       yearly_bonus_amount::float8 AS yearly_bonus_amount,
       yearly_bonus_month,
       yearly_bonus_day,
       currency,
       is_active,
       created_at,
       updated_at
     FROM salary_settings
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [guard.userId],
  );

  // You likely want only one active row; return first for convenience
  return NextResponse.json({ items: r.rows, item: r.rows[0] ?? null });
}

export async function POST(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const body = await req.json().catch(() => null);
  const parsed = CreateOrUpdateSalarySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const s = parsed.data;

  // Upsert: one active per user is enforced by partial unique index in SQL we wrote
  const r = await pool.query(
    `INSERT INTO salary_settings (
       user_id, profile_id,
       net_amount, gross_amount,
       payout_day,
       yearly_bonus_amount, yearly_bonus_month, yearly_bonus_day,
       currency, is_active
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT ON CONSTRAINT salary_settings_user_active_uniq
     DO UPDATE SET
       profile_id = EXCLUDED.profile_id,
       net_amount = EXCLUDED.net_amount,
       gross_amount = EXCLUDED.gross_amount,
       payout_day = EXCLUDED.payout_day,
       yearly_bonus_amount = EXCLUDED.yearly_bonus_amount,
       yearly_bonus_month = EXCLUDED.yearly_bonus_month,
       yearly_bonus_day = EXCLUDED.yearly_bonus_day,
       currency = EXCLUDED.currency,
       is_active = EXCLUDED.is_active
     RETURNING
       id,
       user_id,
       profile_id,
       net_amount::float8 AS net_amount,
       gross_amount::float8 AS gross_amount,
       payout_day,
       yearly_bonus_amount::float8 AS yearly_bonus_amount,
       yearly_bonus_month,
       yearly_bonus_day,
       currency,
       is_active,
       created_at,
       updated_at`,
    [
      guard.userId,
      s.profileId,
      s.netAmount,
      s.grossAmount ?? null,
      s.payoutDay,
      s.yearlyBonusAmount ?? null,
      s.yearlyBonusMonth ?? null,
      s.yearlyBonusDay ?? null,
      s.currency,
      s.isActive,
    ],
  );

  return NextResponse.json({ item: r.rows[0] }, { status: 201 });
}
