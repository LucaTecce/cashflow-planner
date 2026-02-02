import { NextResponse } from "next/server"
import { z } from "zod"
import { pool } from "@/lib/db"
import { requireApiUser } from "@/lib/authz"

const PatchSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.number().finite(),
  description: z.string().min(1).max(200),
  category: z.string().max(120).nullable().optional(),
  isBusiness: z.boolean().default(false),
  isTaxRelevant: z.boolean().default(false),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser()
  if (!guard.ok) return guard.res

  const { id } = await ctx.params

  const body = await req.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const t = parsed.data

  // Ownership check for accountId
  const chk = await pool.query(
    `SELECT 1 FROM accounts WHERE user_id = $1 AND id = $2 LIMIT 1`,
    [guard.userId, t.accountId],
  )
  if (chk.rowCount === 0) {
    return NextResponse.json({ error: "Invalid account reference" }, { status: 400 })
  }

  const r = await pool.query(
    `
    UPDATE transactions
    SET
      account_id = $1,
      amount = $2,
      description = $3,
      category = $4,
      is_business = $5,
      is_tax_relevant = $6,
      tx_date = $7
    WHERE user_id = $8
      AND id = $9
      AND transfer_group_id IS NULL
    RETURNING id
    `,
    [
      t.accountId,
      t.amount,
      t.description,
      t.category ?? null,
      t.isBusiness,
      t.isTaxRelevant,
      t.txDate,
      guard.userId,
      id,
    ],
  )

  if (r.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ ok: true, id: r.rows[0].id })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser()
  if (!guard.ok) return guard.res

  const { id } = await ctx.params

  const r = await pool.query(
    `
        DELETE FROM transactions
        WHERE user_id = $1
          AND id = $2
          AND transfer_group_id IS NULL
    `,
    [guard.userId, id],
  )

  if (r.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ ok: true, deleted: r.rowCount })
}
