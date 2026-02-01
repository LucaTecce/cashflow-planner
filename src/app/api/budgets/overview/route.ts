import { NextResponse } from "next/server"
import { z } from "zod"
import { pool } from "@/lib/db"
import { requireApiUser } from "@/lib/authz"

const QuerySchema = z.object({
  // optional: wenn nicht gesetzt, nutzen wir Budget.period_start/period_end je Budget
  // (wir brauchen hier erstmal keine query-params)
})

export async function GET(req: Request) {
  const guard = await requireApiUser()
  if (!guard.ok) return guard.res

  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 })

  const r = await pool.query(
    `
    SELECT
      b.id,
      b.account_id,
      a.name AS account_name,
      b.name,
      b.category,
      b.planned_amount,
      b.period_type,
      b.period_start::text AS period_start,
      b.period_end::text AS period_end,

      COALESCE((
        SELECT
          -- "used" as positive expenses
          SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END)
        FROM transactions t
        WHERE t.user_id = b.user_id
          AND t.category = b.category
          AND (b.account_id IS NULL OR t.account_id = b.account_id)
          AND t.tx_date BETWEEN b.period_start AND b.period_end
      ), 0) AS used_amount

    FROM budgets b
    LEFT JOIN accounts a ON a.id = b.account_id
    WHERE b.user_id = $1
    ORDER BY b.created_at DESC
    `,
    [guard.userId],
  )

  return NextResponse.json({ items: r.rows })
}
