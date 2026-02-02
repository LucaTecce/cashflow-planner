import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireApiUser } from "@/lib/authz";

export async function GET() {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const userId = guard.userId;

  const balances = await pool.query(
    `
    SELECT
        COALESCE(SUM(a.initial_balance + COALESCE(x.movement, 0)), 0)::float8 AS total_balance
    FROM accounts a
    LEFT JOIN (
      SELECT account_id, SUM(amount) AS movement
      FROM transactions
      WHERE user_id = $1
      GROUP BY account_id
    ) x ON x.account_id = a.id
    WHERE a.user_id = $1
    `,
    [userId],
  );

  const cashflow30 = await pool.query(
    `
        SELECT COALESCE(SUM(amount), 0)::float8 AS cashflow_30d
        FROM transactions
    WHERE user_id = $1
      AND tx_date >= (CURRENT_DATE - INTERVAL '30 days')
    `,
    [userId],
  );

  const income30 = await pool.query(
    `
        SELECT COALESCE(SUM(amount), 0)::float8 AS income_30d
        FROM transactions
    WHERE user_id = $1
      AND tx_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND amount > 0
    `,
    [userId],
  );

  const expense30 = await pool.query(
    `
        SELECT COALESCE(SUM(amount), 0)::float8 AS expense_30d
        FROM transactions
    WHERE user_id = $1
      AND tx_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND amount < 0
    `,
    [userId],
  );

  return NextResponse.json({
    totalBalance: balances.rows[0].total_balance,
    cashflow30d: cashflow30.rows[0].cashflow_30d,
    income30d: income30.rows[0].income_30d,
    expense30d: expense30.rows[0].expense_30d,
  });
}
