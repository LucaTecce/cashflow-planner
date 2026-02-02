import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireApiUser } from "@/lib/authz";

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum");

const CreateRecurringSchema = z.object({
  accountId: z.string().min(1, "Konto fehlt"),

  // Page sendet signed amount direkt als number
  amount: z.number().finite(),

  description: z.string().min(1, "Beschreibung fehlt").max(200),
  category: z.string().min(1, "Kategorie fehlt").max(120),

  intervalType: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]).default("MONTHLY"),

  // Page sendet number|null (via toDayOfMonth)
  dayOfMonth: z.number().int().min(1).max(31).nullable(),

  startDate: DateOnly,
  endDate: DateOnly.nullish(),

  isBusiness: z.boolean().default(false),
  isTaxRelevant: z.boolean().default(false),
});


export async function GET() {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const r = await pool.query(
    `
        SELECT
            r.id, r.account_id, a.name as account_name,
            r.amount::float8 as amount, r.description, r.category,
            r.interval_type, r.day_of_month,
            r.is_business, r.is_tax_relevant,
            r.start_date::text AS start_date,
                r.end_date::text AS end_date,
                r.created_at, r.updated_at
        FROM recurring r
                 JOIN accounts a ON a.id = r.account_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
    `,
    [guard.userId],
  );

  return NextResponse.json({ items: r.rows });
}

export async function POST(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const body = await req.json().catch(() => null); // Route Handler Body lesen [web:945]
  const parsed = CreateRecurringSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const x = parsed.data;

  // Sicherheitscheck: account gehört dem User
  const acc = await pool.query(
    `SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2`,
    [x.accountId, guard.userId],
  );
  if (acc.rowCount === 0) return NextResponse.json({ error: "Invalid account" }, { status: 400 });

  const amountSigned = x.amount;
  const dayOfMonth = x.intervalType === "MONTHLY" ? x.dayOfMonth : null;

  const r = await pool.query(
    `
    INSERT INTO recurring
      (user_id, account_id, amount, description, category, interval_type, day_of_month,
       is_business, is_tax_relevant, start_date, end_date)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING
        id,
        account_id,
        amount::float8 as amount,
        description,
        category,
        interval_type,
        day_of_month,
        is_business,
        is_tax_relevant,
        start_date::text as start_date,
        end_date::text as end_date,
        created_at,
        updated_at

    `,
    [
      guard.userId,
      x.accountId,
      amountSigned,
      x.description.trim(),
      x.category.trim(),
      x.intervalType,
      dayOfMonth,
      x.isBusiness,
      x.isTaxRelevant,
      x.startDate,
      x.endDate ?? null,
    ],
  );

  return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
}
