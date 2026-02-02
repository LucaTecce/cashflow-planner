'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { apiGet, apiSend } from '@/lib/api';
import { parseMoneyDE, formatEUR } from '@/lib/money';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

/* =========================
 * Schema helpers
 * ========================= */

const MoneyRequired = z
  .string()
  .refine((s) => s.trim() !== '', 'Pflichtfeld')
  .transform((s) => parseMoneyDE(s))
  .refine((n) => Number.isFinite(n) && n > 0, 'Ungültiger Betrag');

const MoneyOptional = z
  .string()
  .optional()
  .transform((s) => (s && s.trim() ? parseMoneyDE(s) : null))
  .refine((n) => n == null || Number.isFinite(n), 'Ungültiger Betrag');

const IntRequired = (min: number, max: number, label: string) =>
  z
    .string()
    .refine((s) => s.trim() !== '', 'Pflichtfeld')
    .transform((s) => Number(s))
    .refine(
      (n) => Number.isInteger(n) && n >= min && n <= max,
      `${label} ${min}–${max}`,
    );

const IntOptional = (min: number, max: number, label: string) =>
  z
    .string()
    .optional()
    .transform((s) => (s && s.trim() ? Number(s) : null))
    .refine(
      (n) =>
        n == null ||
        (Number.isInteger(n) && n >= min && n <= max),
      `${label} ${min}–${max}`,
    );

/* =========================
 * Schema
 * ========================= */

const SalarySchema = z
  .object({
    profileId: z.string().uuid('Ungültige Profil-ID'),

    netAmount: MoneyRequired,
    grossAmount: MoneyOptional,

    payoutDay: IntRequired(1, 31, 'Tag'),

    yearlyBonusAmount: MoneyOptional,
    yearlyBonusMonth: IntOptional(1, 12, 'Monat'),
    yearlyBonusDay: IntOptional(1, 31, 'Tag'),
  })
  .refine(
    (v) => {
      const any =
        v.yearlyBonusAmount != null ||
        v.yearlyBonusMonth != null ||
        v.yearlyBonusDay != null;

      const all =
        v.yearlyBonusAmount != null &&
        v.yearlyBonusMonth != null &&
        v.yearlyBonusDay != null;

      return !any || all;
    },
    {
      message:
        'Bonus: Betrag, Monat und Tag müssen gemeinsam gesetzt sein',
      path: ['yearlyBonusAmount'],
    },
  );

/* =========================
 * Types
 * ========================= */

type SalaryInput = z.input<typeof SalarySchema>;
type SalaryOutput = z.output<typeof SalarySchema>;

type SalaryItem = {
  id: string;
  profile_id: string;
  net_amount: number;
  gross_amount: number | null;
  payout_day: number;
  yearly_bonus_amount: number | null;
  yearly_bonus_month: number | null;
  yearly_bonus_day: number | null;
};

/* =========================
 * Page
 * ========================= */

export default function IncomeSalaryPage() {
  const [item, setItem] = React.useState<SalaryItem | null>(null);
  const [loading, setLoading] = React.useState(true);

  const form = useForm<SalaryInput>({
    resolver: zodResolver(SalarySchema),
    defaultValues: {
      profileId: '',
      netAmount: '',
      grossAmount: '',
      payoutDay: '25',
      yearlyBonusAmount: '',
      yearlyBonusMonth: '',
      yearlyBonusDay: '',
    },
  });

  /* -------- load -------- */

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { item } = await apiGet<{ item: SalaryItem | null }>(
          '/api/income/salary',
        );

        setItem(item);

        if (item) {
          form.reset({
            profileId: item.profile_id,
            netAmount: formatEUR(item.net_amount),
            grossAmount: item.gross_amount
              ? formatEUR(item.gross_amount)
              : '',
            payoutDay: String(item.payout_day),
            yearlyBonusAmount: item.yearly_bonus_amount
              ? formatEUR(item.yearly_bonus_amount)
              : '',
            yearlyBonusMonth: item.yearly_bonus_month
              ? String(item.yearly_bonus_month)
              : '',
            yearlyBonusDay: item.yearly_bonus_day
              ? String(item.yearly_bonus_day)
              : '',
          });
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- submit -------- */

  async function onSubmit(values: SalaryInput) {
    const parsed: SalaryOutput = SalarySchema.parse(values);

    const { item } = await apiSend<{ item: SalaryItem }>(
      '/api/income/salary',
      {
        method: 'POST',
        body: JSON.stringify({
          ...parsed,
          currency: 'EUR',
          isActive: true,
        }),
      },
    );

    setItem(item);
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">Lade…</div>
    );
  }

  /* -------- UI -------- */

  return (
    <div className="space-y-6 max-w-xl">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Gehalt</h2>
        <p className="text-sm text-muted-foreground">
          Wird automatisch monatlich im Finanzplan berücksichtigt.
        </p>
      </header>

      <Form<SalaryInput> {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="profileId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profil</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Profile UUID" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="netAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Netto (EUR)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="2.500,00" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="grossAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brutto (optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="3.800,00" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="payoutDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Auszahlungstag</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="25" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="pt-2 text-sm text-muted-foreground">
            Optional: 13. Gehalt / Bonus
          </div>

          <FormField
            control={form.control}
            name="yearlyBonusAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bonus Betrag</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="2.500,00" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="yearlyBonusMonth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bonus Monat</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="12" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="yearlyBonusDay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bonus Tag</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="15" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
          >
            Speichern
          </Button>
        </form>
      </Form>

      {item && (
        <div className="text-sm text-muted-foreground">
          Aktuell gespeichert:{' '}
          {formatEUR(item.net_amount)} € · Auszahlung am{' '}
          {item.payout_day}.
        </div>
      )}
    </div>
  );
}
