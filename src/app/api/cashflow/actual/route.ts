import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/authz';
import { buildCashflowActualMonth } from '@/lib/cashflow/actual';

const QuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  accountId: z.string().uuid().optional(), // optional filter
});

export async function GET(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    month: searchParams.get('month'),
    accountId: searchParams.get('accountId') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });

  const data = await buildCashflowActualMonth({
    userId: guard.userId,
    month: parsed.data.month,
    accountId: parsed.data.accountId,
  });

  return NextResponse.json(data);
}
