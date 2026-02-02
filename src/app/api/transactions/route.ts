import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireApiUser } from '@/lib/authz';

const QuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  category: z.string().min(1).optional(),
  isBusiness: z.enum(['true', 'false']).optional(),
  isTaxRelevant: z.enum(['true', 'false']).optional(),
});

const CreateTransactionSchema = z
  .object({
    kind: z.enum(['NORMAL', 'TRANSFER']),

    // NORMAL
    accountId: z.string().uuid().optional(),

    // TRANSFER
    fromAccountId: z.string().uuid().optional(),
    toAccountId: z.string().uuid().optional(),

    // NORMAL: +/- möglich, UI sendet i.d.R. mit Vorzeichen; TRANSFER: positiv
    amount: z.number().finite(),

    description: z.string().min(1).max(200),
    category: z.string().max(120).optional(),
    tags: z.array(z.string().max(40)).default([]),

    isBusiness: z.boolean().default(false),
    isTaxRelevant: z.boolean().default(false),

    txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'NORMAL') {
      if (!v.accountId) ctx.addIssue({ code: 'custom', message: 'accountId required for NORMAL' });
      if (v.fromAccountId || v.toAccountId)
        ctx.addIssue({ code: 'custom', message: 'No from/to for NORMAL' });
    }
    if (v.kind === 'TRANSFER') {
      if (!v.fromAccountId || !v.toAccountId)
        ctx.addIssue({ code: 'custom', message: 'fromAccountId and toAccountId required' });
      if (v.fromAccountId && v.toAccountId && v.fromAccountId === v.toAccountId)
        ctx.addIssue({ code: 'custom', message: 'from and to must differ' });
      if (v.amount <= 0) ctx.addIssue({ code: 'custom', message: 'amount must be > 0 for TRANSFER' });
      if (v.accountId) ctx.addIssue({ code: 'custom', message: 'No accountId for TRANSFER' });
    }
  });

export async function GET(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    accountId: url.searchParams.get('accountId') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    isBusiness: url.searchParams.get('isBusiness') ?? undefined,
    isTaxRelevant: url.searchParams.get('isTaxRelevant') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });

  const q = parsed.data;

  // Für MVP: Filter auf account_id (die Legs haben jeweils ein account_id),
  // d.h. Transfer erscheint, wenn from oder to dem Filterkonto entspricht.
  const params: any[] = [guard.userId];
  let where = `t.user_id = $1`;

  if (q.accountId) {
    params.push(q.accountId);
    where += ` AND t.account_id = $${params.length}`;
  }
  if (q.category) {
    params.push(q.category);
    where += ` AND t.category = $${params.length}`;
  }
  if (q.isBusiness) {
    params.push(q.isBusiness === 'true');
    where += ` AND t.is_business = $${params.length}`;
  }
  if (q.isTaxRelevant) {
    params.push(q.isTaxRelevant === 'true');
    where += ` AND t.is_tax_relevant = $${params.length}`;
  }

  // 1) Normale Transaktionen (nicht Teil eines Transfers)
  const normal = await pool.query(
    `
        SELECT
            t.id,
            'NORMAL' as kind,
            t.account_id,
            a.name as account_name,

            NULL::uuid as from_account_id,
                NULL::text as from_account_name,
                NULL::uuid as to_account_id,
                NULL::text as to_account_name,

                t.amount::float8 as amount,
                t.description,
            t.category,
            t.tags,
            t.is_business,
            t.is_tax_relevant,
            t.tx_date::text,
                t.created_at,
            NULL::uuid as transfer_group_id
        FROM transactions t
                 LEFT JOIN accounts a ON a.id = t.account_id
        WHERE ${where}
          AND t.transfer_group_id IS NULL
        ORDER BY t.tx_date DESC, t.created_at DESC
            LIMIT 500
    `,
    params,
  );

  // 2) Transfers aggregiert (OUT + IN self-join)
  // Wir müssen den Filter (wo immer möglich) ebenfalls anwenden.
  // Dazu wenden wir die gleichen Bedingungen an "out" und "inp" separat an, indem wir sie als t aliasen.
  // Für MVP verwenden wir: gleiche where-Logik über out und inp jeweils, aber das ist aufwändiger.
  // Einfacher: wir filtern erstmal nur auf user_id und lassen weitere Filter in der UI (oder später SQL) zu.
  //
  // Da du bereits Filter willst, machen wir: wir verwenden exakt denselben where-String,
  // indem wir "t." durch "out." bzw. "inp." ersetzen.
  const whereOut = where.replaceAll('t.', 'out.');
  const whereIn = where.replaceAll('t.', 'inp.');

  const transfers = await pool.query(
    `
        SELECT
            'TRANSFER' as kind,
            NULL::uuid as id,
                NULL::uuid as account_id,
                NULL::text as account_name,

                out.account_id as from_account_id,
            fa.name as from_account_name,

            inp.account_id as to_account_id,
            ta.name as to_account_name,

            inp.amount::float8 as amount, -- positiv
                COALESCE(out.description, inp.description) as description,
            COALESCE(out.category, inp.category) as category,
            COALESCE(out.tags, inp.tags) as tags,
            (out.is_business OR inp.is_business) as is_business,
            (out.is_tax_relevant OR inp.is_tax_relevant) as is_tax_relevant,
            COALESCE(out.tx_date, inp.tx_date)::text as tx_date,
                LEAST(out.created_at, inp.created_at) as created_at,
            out.transfer_group_id
        FROM transactions out
                 JOIN transactions inp
                      ON inp.transfer_group_id = out.transfer_group_id
                          AND inp.transfer_leg = 'IN'
                 LEFT JOIN accounts fa ON fa.id = out.account_id
                 LEFT JOIN accounts ta ON ta.id = inp.account_id
        WHERE ${whereOut}
          AND ${whereIn}
          AND out.transfer_group_id IS NOT NULL
          AND out.transfer_leg = 'OUT'
        ORDER BY COALESCE(out.tx_date, inp.tx_date) DESC, LEAST(out.created_at, inp.created_at) DESC
            LIMIT 500
    `,
    params,
  );

  const items = [...normal.rows, ...transfers.rows].sort((a: any, b: any) => {
    if (a.tx_date === b.tx_date) return String(b.created_at).localeCompare(String(a.created_at));
    return String(b.tx_date).localeCompare(String(a.tx_date));
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const guard = await requireApiUser();
  if (!guard.ok) return guard.res;

  const body = await req.json().catch(() => null);
  const parsed = CreateTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const t = parsed.data;

  // Ownership checks (alle referenzierten Accounts müssen dem User gehören)
  const ids = [t.accountId, t.fromAccountId, t.toAccountId].filter(Boolean) as string[];
  if (ids.length) {
    const chk = await pool.query(
      `SELECT COUNT(*)::int as c FROM accounts WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [guard.userId, ids],
    );
    if ((chk.rows[0]?.c ?? 0) !== ids.length) {
      return NextResponse.json({ error: 'Invalid account reference' }, { status: 400 });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (t.kind === 'NORMAL') {
      const r = await client.query(
        `
        INSERT INTO transactions
          (user_id, account_id, amount, description, category, tags, is_business, is_tax_relevant, tx_date)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id
        `,
        [
          guard.userId,
          t.accountId!,
          t.amount,
          t.description,
          t.category ?? null,
          t.tags,
          t.isBusiness,
          t.isTaxRelevant,
          t.txDate,
        ],
      );

      await client.query('COMMIT');
      return NextResponse.json({ kind: 'NORMAL', id: r.rows[0].id }, { status: 201 });
    }

    // TRANSFER: 2 legs, atomar
    const grp = await client.query(`SELECT gen_random_uuid() as id`);
    const transferGroupId = grp.rows[0].id as string;

    const outRes = await client.query(
      `
      INSERT INTO transactions
        (user_id, account_id, amount, description, category, tags, is_business, is_tax_relevant, tx_date,
         transfer_group_id, transfer_leg)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'OUT')
      RETURNING id
      `,
      [
        guard.userId,
        t.fromAccountId!,
        -Math.abs(t.amount),
        t.description,
        t.category ?? 'Transfer',
        t.tags,
        t.isBusiness,
        t.isTaxRelevant,
        t.txDate,
        transferGroupId,
      ],
    );

    const inRes = await client.query(
      `
      INSERT INTO transactions
        (user_id, account_id, amount, description, category, tags, is_business, is_tax_relevant, tx_date,
         transfer_group_id, transfer_leg)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'IN')
      RETURNING id
      `,
      [
        guard.userId,
        t.toAccountId!,
        Math.abs(t.amount),
        t.description,
        t.category ?? 'Transfer',
        t.tags,
        t.isBusiness,
        t.isTaxRelevant,
        t.txDate,
        transferGroupId,
      ],
    );

    await client.query('COMMIT');
    return NextResponse.json(
      { kind: 'TRANSFER', transferGroupId, outId: outRes.rows[0].id, inId: inRes.rows[0].id },
      { status: 201 },
    );
  } catch (_e) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  } finally {
    client.release();
  }
}
