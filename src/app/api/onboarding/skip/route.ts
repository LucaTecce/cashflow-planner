import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireApiUser } from "@/lib/authz";

const BodySchema = z.object({
  step: z.enum(["RECURRING", "BUDGETS"]),
});

export async function POST(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await pool.query(
    `INSERT INTO user_onboarding (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [guard.userId],
  );

  if (parsed.data.step === "RECURRING") {
    await pool.query(`UPDATE user_onboarding SET skipped_recurring = true WHERE user_id = $1`, [guard.userId]);
  } else {
    await pool.query(`UPDATE user_onboarding SET skipped_budgets = true WHERE user_id = $1`, [guard.userId]);
  }

  return NextResponse.json({ ok: true });
}
