'use client';

import * as React from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { parseMoneyDE } from '@/lib/money';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

import { apiGet, apiSend } from '@/lib/api';

// Schema ohne transform - TS happy
const CreateInvoiceSchema = z.object({
  customerName: z.string().max(240).optional().default(''),
  amount: z
    .string()
    .min(1, 'Betrag erforderlich')
    .refine((s) => {
      const n = parseMoneyDE(s);
      return Number.isFinite(n) && n > 0;
    }, 'Ungültiger Betrag (z.B. 1.234,56)'),
  expectedPaymentDate: z.string().min(1, 'Datum erforderlich'),
  notes: z.string().max(4000).optional().default(''),
});

type FormData = z.infer<typeof CreateInvoiceSchema>;

type InvoiceItem = {
  id: string;
  customerName?: string;
  amount: number;
  expectedPaymentDate: string;
  notes?: string;
};

type InvoicesResponse = {
  items: InvoiceItem[];
};


export default function IncomeInvoicesPage() {
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  const form = useForm<FormData>({
    resolver: zodResolver(CreateInvoiceSchema),
    defaultValues: {
      customerName: '',
      amount: '',
      expectedPaymentDate: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  });

  async function reload() {
    setLoading(true);
    try {
      const data = await apiGet<InvoicesResponse>('/api/income/invoices');
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(values: FormData) {
    const payload = {
      ...values,
      amount: parseMoneyDE(values.amount), // Parse nur hier
    };

    await apiSend('/api/income/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    form.reset();
    reload();
  }

  React.useEffect(() => {
    reload();
  }, []);

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Einnahmen - Rechnungen</h1>
        <Button
          onClick={() => form.reset()}
          variant="outline"
          disabled={form.formState.isSubmitting}
        >
          Form zurücksetzen
        </Button>
      </div>

      {/* Create Form */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4 bg-card p-6 rounded-xl border">
          <h2 className="text-xl font-semibold">Neue Rechnung</h2>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kunde</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. ACME GmbH" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Betrag (€)</FormLabel>
                    <FormControl>
                      <Input placeholder="1.234,56 €" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expectedPaymentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fälligkeit</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notizen (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Zusätzliche Informationen..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? 'Speichere...' : 'Rechnung erstellen'}
              </Button>
            </form>
          </Form>
        </div>

        {/* Rechnungen Liste */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Offene Rechnungen ({items.length})</h2>
            <Button
              variant="outline"
              onClick={reload}
              disabled={loading}
            >
              {loading ? 'Lade...' : 'Aktualisieren'}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Noch keine Rechnungen vorhanden.
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate group-hover:underline">
                        {item.customerName || 'Unbekannter Kunde'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(item.expectedPaymentDate).toLocaleDateString('de-DE')}
                      </p>
                      {item.notes && (
                        <p className="text-sm mt-1 line-clamp-2">{item.notes}</p>
                      )}
                    </div>
                    <div className="text-right min-w-[120px]">
                      <p className="text-2xl font-bold text-primary">
                        €{(item.amount || 0).toLocaleString('de-DE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      </p>
                      <p className="text-xs text-muted-foreground">Offen</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
