import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export async function requireUser() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  if (!session || !userId) redirect('/login');
  return { session, userId };
}
