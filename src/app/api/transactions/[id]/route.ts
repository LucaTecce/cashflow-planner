import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireApiUser } from "@/lib/authz";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params; // transfer_group_id

  const r = await pool.query(
    `
        DELETE FROM transactions
        WHERE user_id = $1
          AND transfer_group_id = $2
    `,
    [guard.userId, id],
  );

  if (r.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft check: today it's expected to be 2 (OUT+IN), but don't hard-fail.
  return NextResponse.json({
    ok: true,
    deleted: r.rowCount,
    warning: r.rowCount !== 2 ? "Unexpected row count for transfer group" : undefined,
  });
}
