import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';
import { electronicFormat, isValid as isValidIban } from "iban"; // NEW [web:117]

const CreateAccountSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['PRIVATE', 'BUSINESS', 'TAX']).default('PRIVATE'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3b82f6'),
  initialBalance: z.string().default("0"),

  // NEW: IBAN (optional oder required – hier optional, aber im UI sichtbar)
  iban: z
    .string()
    .transform((v) => electronicFormat(v)) // removes spaces, uppercases [web:117]
    .refine((v) => isValidIban(v), "Invalid IBAN") // real IBAN check [web:117]
    .optional(),
});

export async function GET() {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const r = await pool.query(
    `SELECT id, name, type, color, initial_balance, iban, created_at, updated_at
     FROM accounts
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
  const parsed = CreateAccountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const a = parsed.data;

  const r = await pool.query(
    `INSERT INTO accounts (user_id, name, type, color, initial_balance, iban)
     VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, type, color, initial_balance, iban, created_at, updated_at`,
    [guard.userId, a.name, a.type, a.color, a.initialBalance, a.iban ?? null],
  );

  return NextResponse.json({ item: r.rows[0] }, { status: 201 });
}
