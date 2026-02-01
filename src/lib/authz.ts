import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export async function requireApiUser() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  if (!session || !userId) {
    return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { ok: true as const, userId, session };
}
