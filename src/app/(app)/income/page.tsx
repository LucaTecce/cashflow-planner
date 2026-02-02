import { redirect } from 'next/navigation';

export default function IncomeIndexPage() {
  // Default landing: invoices
  redirect('/income/invoices');
}
