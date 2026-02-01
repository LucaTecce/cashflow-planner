import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireApiUser } from "@/lib/authz";

export async function GET() {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  // ensure row exists
  await pool.query(
    `INSERT INTO user_onboarding (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [guard.userId],
  );

  const [prefsRes, accRes, recRes, budRes] = await Promise.all([
    pool.query(
      `SELECT skipped_recurring, skipped_budgets, completed_at
       FROM user_onboarding
       WHERE user_id = $1`,
      [guard.userId],
    ),
    pool.query(`SELECT COUNT(*)::int AS c FROM accounts WHERE user_id = $1`, [guard.userId]),
    pool.query(`SELECT COUNT(*)::int AS c FROM recurring WHERE user_id = $1`, [guard.userId]),
    pool.query(`SELECT COUNT(*)::int AS c FROM budgets WHERE user_id = $1`, [guard.userId]),
  ]);

  const prefs = prefsRes.rows[0] ?? { skipped_recurring: false, skipped_budgets: false, completed_at: null };
  const accountsCount = accRes.rows[0]?.c ?? 0;
  const recurringCount = recRes.rows[0]?.c ?? 0;
  const budgetsCount = budRes.rows[0]?.c ?? 0;

  if (prefs.completed_at) {
    return NextResponse.json({ done: true, step: "DONE", accountsCount, recurringCount, budgetsCount });
  }

  let step: "ACCOUNTS" | "RECURRING" | "BUDGETS" | "DONE" = "DONE";

  if (accountsCount < 1) step = "ACCOUNTS";
  else if (!prefs.skipped_recurring && recurringCount < 1) step = "RECURRING";
  else if (!prefs.skipped_budgets && budgetsCount < 1) step = "BUDGETS";
  else step = "DONE";

  if (step === "DONE") {
    await pool.query(`UPDATE user_onboarding SET completed_at = NOW() WHERE user_id = $1`, [guard.userId]);
    return NextResponse.json({ done: true, step: "DONE", accountsCount, recurringCount, budgetsCount });
  }

  return NextResponse.json({
    done: false,
    step,
    accountsCount,
    recurringCount,
    budgetsCount,
  });
}
