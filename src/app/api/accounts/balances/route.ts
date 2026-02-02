import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

export async function GET() {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const r = await pool.query(
    `
        SELECT
            a.id,
            a.name,
            a.type,
            a.color,
            a.iban,
            a.initial_balance::float8 as initial_balance,
                COALESCE(SUM(t.amount), 0)::float8 AS movement,
                (a.initial_balance + COALESCE(SUM(t.amount), 0))::float8 AS balance
        FROM accounts a
                 LEFT JOIN transactions t
                           ON t.account_id = a.id
                               AND t.user_id = a.user_id
        WHERE a.user_id = $1
        GROUP BY a.id, a.name, a.type, a.color, a.iban, a.initial_balance
        ORDER BY a.created_at DESC
    `,
    [guard.userId]
  )


  return NextResponse.json({ items: r.rows });
}
