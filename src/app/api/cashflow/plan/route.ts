import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/authz';
import { buildCashflowPlanMonth } from '@/lib/cashflow/plan';

const QuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function GET(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({ month: searchParams.get('month') });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid month' }, { status: 400 });

  const data = await buildCashflowPlanMonth({
    userId: guard.userId,
    month: parsed.data.month,
  });

  return NextResponse.json(data);
}
