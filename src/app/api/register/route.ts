import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(120).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { email, password, name } = parsed.data;

  const existing = await pool.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
  if (existing.rowCount) {
    return NextResponse.json({ error: 'Email already used' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12); // work factor ≥10 ist sinnvoll
  await pool.query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
    [email, passwordHash, name ?? null],
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
