export type InvoiceStatus = 'planned' | 'sent' | 'paid' | 'void';

export type Invoice = {
  id: string;
  user_id: string;
  profile_id: string | null;
  customer_id: string | null;
  customer_name: string;
  amount: number;               // IMPORTANT: number from API
  currency: string;
  service_date: string | null;
  issued_at: string | null;
  due_date: string | null;
  expected_payment_date: string | null;
  status: InvoiceStatus;
  paid_at: string | null;
  paid_tx_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};
