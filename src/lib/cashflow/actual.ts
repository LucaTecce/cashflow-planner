import { pool } from '@/lib/db';

export type CashflowActualTx = {
  id: string;
  tx_date: string; // YYYY-MM-DD
  account_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;

  amount: number; // signed
  description: string;
  category: string | null;

  transfer_group_id: string | null;
  transfer_leg: string | null;

  invoice_id: string | null;
};

export type CashflowActualItem =
  | { kind: 'tx'; tx: CashflowActualTx }
  | {
  kind: 'transfer';
  transferGroupId: string;
  date: string;
  title: string;
  legs: CashflowActualTx[]; // typically 2
  net: number; // for a filtered single account view this can be +/-; for "all accounts" will be 0
};

export type CashflowActualDay = {
  date: string;
  income: number;
  expense: number;
  net: number;
  items: CashflowActualItem[];
  runningBalance: number;
};

export type CashflowActualMonthResponse = {
  month: string;
  startDate: string;
  endDateExclusive: string;

  openingBalance: number;
  closingBalance: number;

  totals: {
    income: number;
    expense: number;
    net: number;
  };

  days: CashflowActualDay[];
};

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
    year: y,
    monthIndex0: m - 1,
  };
}

function lastDayOfMonthUTC(year: number, monthIndex0: number) {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function dateUTC(year: number, monthIndex0: number, day: number) {
  return new Date(Date.UTC(year, monthIndex0, day)).toISOString().slice(0, 10);
}

function classify(amount: number) {
  return amount >= 0 ? { income: amount, expense: 0 } : { income: 0, expense: Math.abs(amount) };
}

export async function buildCashflowActualMonth(params: {
  userId: string;
  month: string;
  accountId?: string;
}): Promise<CashflowActualMonthResponse> {
  const { userId, month, accountId } = params;
  const { startDate, endDateExclusive, year, monthIndex0 } = monthBounds(month);

  // Opening balance: if accountId is provided, use that account's initial_balance + sum(tx before month)
  // If no accountId: sum across all accounts initial_balance + tx before month (excluding transfers net = 0 anyway).
  // Note: This assumes your accounts.initial_balance exists and should be included.
  const opening = accountId
    ? await getOpeningBalanceForAccount(userId, accountId, startDate)
    : await getOpeningBalanceAllAccounts(userId, startDate);

  // Load all transactions in month (optionally filtered by account)
  // IMPORTANT: cast amount to float8 to ensure API number output. [web:3]
  const tx = await pool.query(
    `SELECT
       id,
       tx_date,
       account_id,
       from_account_id,
       to_account_id,
       amount::float8 AS amount,
       description,
       category,
       transfer_group_id,
       transfer_leg,
       invoice_id
     FROM transactions
     WHERE user_id = $1
       AND tx_date >= $2::date
       AND tx_date < $3::date
       AND ($4::uuid IS NULL OR account_id = $4::uuid OR from_account_id = $4::uuid OR to_account_id = $4::uuid)
     ORDER BY tx_date ASC, created_at ASC`,
    [userId, startDate, endDateExclusive, accountId ?? null],
  );

  const rows = tx.rows as CashflowActualTx[];

  // Group transfers: if transfer_group_id exists, group them; otherwise treat as normal tx
  const transfers = new Map<string, CashflowActualTx[]>();
  const normals: CashflowActualTx[] = [];

  for (const r of rows) {
    if (r.transfer_group_id) {
      const g = transfers.get(r.transfer_group_id) ?? [];
      g.push(r);
      transfers.set(r.transfer_group_id, g);
    } else {
      normals.push(r);
    }
  }

  // Build per-day map (pre-create all days for stable UI)
  const dayMap = new Map<string, CashflowActualDay>();
  const last = lastDayOfMonthUTC(year, monthIndex0);

  for (let d = 1; d <= last; d++) {
    const dt = dateUTC(year, monthIndex0, d);
    dayMap.set(dt, {
      date: dt,
      income: 0,
      expense: 0,
      net: 0,
      items: [],
      runningBalance: 0,
    });
  }

  // Add normal tx
  for (const t of normals) {
    const day = dayMap.get(t.tx_date);
    if (!day) continue;

    const c = classify(t.amount);
    day.income += c.income;
    day.expense += c.expense;
    day.net += t.amount;
    day.items.push({ kind: 'tx', tx: t });
  }

  // Add transfers as grouped items; net depends on whether account filter is active.
  for (const [gid, legs] of transfers) {
    // assume all legs share same tx_date; pick first
    const date = legs[0]?.tx_date;
    const day = date ? dayMap.get(date) : undefined;
    if (!day) continue;

    const net = legs.reduce((sum, l) => sum + l.amount, 0);

    // For "all accounts", transfer nets to 0 (two legs cancel) typically.
    // For single-account view, net will be +/- reflecting money leaving/entering that account.
    const c = classify(net);
    day.income += c.income;
    day.expense += c.expense;
    day.net += net;

    day.items.push({
      kind: 'transfer',
      transferGroupId: gid,
      date,
      title: 'Transfer',
      legs: legs.sort((a, b) => a.amount - b.amount), // optional stable ordering
      net,
    });
  }

  // Sort items within day (optional: put transfers first, then tx)
  for (const d of dayMap.values()) {
    d.items.sort((a, b) => {
      if (a.kind === b.kind) return 0;
      return a.kind === 'transfer' ? -1 : 1;
    });
  }

  // Running balance across days
  const days = Array.from(dayMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  let running = opening;
  for (const d of days) {
    running += d.net;
    d.runningBalance = running;
  }

  const totals = days.reduce(
    (acc, d) => {
      acc.income += d.income;
      acc.expense += d.expense;
      acc.net += d.net;
      return acc;
    },
    { income: 0, expense: 0, net: 0 },
  );

  return {
    month,
    startDate,
    endDateExclusive,
    openingBalance: opening,
    closingBalance: running,
    totals,
    days,
  };
}

async function getOpeningBalanceForAccount(userId: string, accountId: string, startDate: string) {
  const r = await pool.query(
    `SELECT
       COALESCE(a.initial_balance::float8, 0) AS initial_balance,
       COALESCE((
         SELECT SUM(t.amount)::float8
         FROM transactions t
         WHERE t.user_id = $1
           AND (t.account_id = $2::uuid OR t.from_account_id = $2::uuid OR t.to_account_id = $2::uuid)
           AND t.tx_date < $3::date
       ), 0) AS before_sum
     FROM accounts a
     WHERE a.user_id = $1 AND a.id = $2::uuid`,
    [userId, accountId, startDate],
  );

  if (r.rowCount === 0) return 0;
  const row = r.rows[0] as { initial_balance: number; before_sum: number };
  return (row.initial_balance ?? 0) + (row.before_sum ?? 0);
}

async function getOpeningBalanceAllAccounts(userId: string, startDate: string) {
  const r = await pool.query(
    `SELECT
       COALESCE((SELECT SUM(a.initial_balance)::float8 FROM accounts a WHERE a.user_id = $1), 0) AS initial_balance_sum,
       COALESCE((
         SELECT SUM(t.amount)::float8
         FROM transactions t
         WHERE t.user_id = $1
           AND t.tx_date < $2::date
       ), 0) AS before_sum`,
    [userId, startDate],
  );

  const row = r.rows[0] as { initial_balance_sum: number; before_sum: number };
  return (row.initial_balance_sum ?? 0) + (row.before_sum ?? 0);
}
