export type CashflowMode = 'plan' | 'actual';

export type CashflowEventSource =
  | 'recurring'
  | 'budget_reserve'
  | 'salary'
  | 'invoice'
  | 'commission';

export type CashflowEvent = {
  id: string;               // stable-ish id for UI keys
  date: string;             // YYYY-MM-DD
  amount: number;           // signed, INCOME +, EXPENSE -
  title: string;
  source: CashflowEventSource;

  // optional metadata
  invoiceId?: string;
  commissionRuleId?: string;
};
