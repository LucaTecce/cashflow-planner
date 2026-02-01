'use client';

import { useEffect, useMemo, useState } from 'react';
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Checkbox } from "@/components/ui/checkbox";

import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Money } from "@/components/money";
import { formatDateDE } from "@/lib/format";

import { RowActions } from "@/components/row-actions";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { parseDateOnly, formatDateOnly, toDateOnlyInput } from "@/lib/date-only"

type Account = { id: string; name: string; type: 'PRIVATE' | 'BUSINESS' | 'TAX'; color: string };

type Recurring = {
  id: string;
  account_id: string;
  account_name: string;
  amount: string; // numeric as string
  description: string;
  category: string;
  interval_type: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  day_of_month: number | null;
  is_business: boolean;
  is_tax_relevant: boolean;
  start_date: string; // may be YYYY-MM-DD or ISO
  end_date: string | null;
};

type Direction = "EXPENSE" | "INCOME";

function intervalLabel(t: Recurring["interval_type"] | "WEEKLY" | "MONTHLY" | "YEARLY") {
  if (t === "WEEKLY") return "Wöchentlich";
  if (t === "MONTHLY") return "Monatlich";
  return "Jährlich";
}

function todayISO() {
  return formatDateOnly(new Date())
}


function toDateAny(v: string) {
  // Accepts "YYYY-MM-DD" and ISO timestamps
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d;

  // Fallback for strict YYYY-MM-DD
  const [y, m, day] = v.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

function toISODateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function toDateInputValue(v: string | null | undefined) {
  if (!v) return "";
  return toISODateOnly(toDateAny(v));
}

function computeNextDue(r: Recurring): string {
  const now = parseDateOnly(todayISO())
  const start = parseDateOnly(toDateOnlyInput(r.start_date))

  if (r.interval_type === "WEEKLY") {
    const msWeek = 7 * 24 * 60 * 60 * 1000
    const diff = Math.max(0, now.getTime() - start.getTime())
    const weeks = Math.floor(diff / msWeek)
    const candidate = new Date(start.getTime() + weeks * msWeek)
    if (candidate < now) candidate.setTime(candidate.getTime() + msWeek)
    return formatDateOnly(candidate)
  }

  if (r.interval_type === "YEARLY") {
    const m = start.getMonth()
    const d = start.getDate()
    let candidate = new Date(now.getFullYear(), m, d, 12, 0, 0, 0)
    if (candidate < now) candidate = new Date(now.getFullYear() + 1, m, d, 12, 0, 0, 0)
    return formatDateOnly(candidate)
  }

  // MONTHLY (wie gehabt, aber candidate ebenfalls mittags)
  const dom = r.day_of_month ?? start.getDate()
  const y = now.getFullYear()
  const m = now.getMonth()

  const clampDom = (yy: number, mm: number, day: number) =>
    Math.min(day, new Date(yy, mm + 1, 0).getDate())

  let candidate = new Date(y, m, clampDom(y, m, dom), 12, 0, 0, 0)
  if (candidate < now) {
    const nm = m + 1
    candidate = new Date(y, nm, clampDom(y, nm, dom), 12, 0, 0, 0)
  }
  return formatDateOnly(candidate)
}

const RecurringFormSchema = z.object({
  accountId: z.string().min(1, "Konto fehlt"),
  direction: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
  amountAbs: z
    .string()
    .min(1, "Betrag fehlt")
    .transform((v) => Number(v))
    .refine((n) => Number.isFinite(n) && n > 0, "Ungültiger Betrag"),
  description: z.string().min(1, "Beschreibung fehlt").max(200),
  category: z.string().min(1, "Kategorie fehlt").max(120).default(""),
  intervalType: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]).default("MONTHLY"),
  dayOfMonth: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .refine((n) => n === null || (Number.isInteger(n) && n >= 1 && n <= 31), "Tag 1–31"),
  startDate: z.string().min(10, "Startdatum fehlt"),
  isBusiness: z.boolean().default(false),
  isTaxRelevant: z.boolean().default(false),
});

type RecurringFormValues = z.infer<typeof RecurringFormSchema>;

function splitAmount(amountStr: string): { direction: Direction; amountAbsStr: string } {
  const n = Number(amountStr);
  const dir: Direction = n < 0 ? "EXPENSE" : "INCOME";
  const absStr = String(Math.abs(n || 0));
  return { direction: dir, amountAbsStr: absStr === "0" ? "" : absStr };
}

export default function RecurringPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<Recurring[]>([]);

  // filters (for overview with multiple accounts)
  const ALL = "ALL";
  const [accountFilter, setAccountFilter] = useState<string>(ALL);
  const [query, setQuery] = useState<string>("");

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // selection
  const [selected, setSelected] = useState<Recurring | null>(null);

  // delete confirm
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [saving, setSaving] = useState(false);

  async function load() {
    const [aRes, rRes] = await Promise.all([fetch('/api/accounts'), fetch('/api/recurring')]);
    const aJson = await aRes.json();
    const rJson = await rRes.json();
    setAccounts(aJson.items ?? []);
    setItems(rJson.items ?? []);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((r) => {
      if (accountFilter !== ALL && r.account_id !== accountFilter) return false;
      if (!q) return true;
      return (
        r.description.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q) ||
        (r.account_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, accountFilter, query]);

  const itemsWithNext = useMemo(() => {
    return filtered
      .map((r) => ({ r, nextDue: computeNextDue(r), amountN: Number(r.amount) }))
      .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  }, [filtered]);

  const sumMonthly = useMemo(() => {
    const m = filtered.reduce((acc, r) => {
      const a = Number(r.amount);
      if (r.interval_type === 'WEEKLY') return acc + a * 4;
      if (r.interval_type === 'YEARLY') return acc + a / 12;
      return acc + a;
    }, 0);
    return m;
  }, [filtered]);

  const perAccount = useMemo(() => {
    const map = new Map<string, { account_id: string; account_name: string; totalMonthly: number; count: number }>();
    for (const r of filtered) {
      const a = Number(r.amount);
      const monthly =
        r.interval_type === "WEEKLY" ? a * 4 :
          r.interval_type === "YEARLY" ? a / 12 :
            a;

      const cur = map.get(r.account_id) ?? {
        account_id: r.account_id,
        account_name: r.account_name,
        totalMonthly: 0,
        count: 0,
      };
      cur.totalMonthly += monthly;
      cur.count += 1;
      map.set(r.account_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.account_name.localeCompare(b.account_name));
  }, [filtered]);

  const nextUp = useMemo(() => itemsWithNext.slice(0, 5), [itemsWithNext]);

  const createForm = useForm<RecurringFormValues>({
    resolver: zodResolver(RecurringFormSchema),
    defaultValues: {
      accountId: "",
      direction: "EXPENSE",
      amountAbs: "500",
      description: "",
      category: "Wohnen",
      intervalType: "MONTHLY",
      dayOfMonth: "1",
      startDate: todayISO(),
      isBusiness: false,
      isTaxRelevant: false,
    },
  });

  const editForm = useForm<RecurringFormValues>({
    resolver: zodResolver(RecurringFormSchema),
    defaultValues: {
      accountId: "",
      direction: "EXPENSE",
      amountAbs: "500",
      description: "",
      category: "",
      intervalType: "MONTHLY",
      dayOfMonth: "1",
      startDate: todayISO(),
      isBusiness: false,
      isTaxRelevant: false,
    },
  });

  function ensureDefaultAccountInForm() {
    const current = createForm.getValues("accountId");
    if (!current && accounts.length) createForm.setValue("accountId", accounts[0].id);
  }

  useEffect(() => {
    ensureDefaultAccountInForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  function signedAmount(values: RecurringFormValues) {
    const abs = values.amountAbs;
    return values.direction === "EXPENSE" ? -abs : abs;
  }

  async function onCreate(values: RecurringFormValues) {
    setSaving(true);
    try {
      const payload = {
        accountId: values.accountId,
        amount: signedAmount(values),
        description: values.description.trim(),
        category: values.category.trim(),
        intervalType: values.intervalType,
        dayOfMonth: values.intervalType === "MONTHLY" ? values.dayOfMonth : null,
        startDate: values.startDate,
        isBusiness: values.isBusiness,
        isTaxRelevant: values.isTaxRelevant,
      };

      const r = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error("Create failed");

      setCreateOpen(false);
      createForm.reset({
        ...createForm.getValues(),
        description: "",
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  function openEdit(r: Recurring) {
    setSelected(r);
    const { direction, amountAbsStr } = splitAmount(r.amount);

    editForm.reset({
      accountId: r.account_id,
      direction,
      amountAbs: amountAbsStr,
      description: r.description ?? "",
      category: r.category ?? "",
      intervalType: r.interval_type,
      dayOfMonth: r.day_of_month ? String(r.day_of_month) : "",
      startDate: toDateOnlyInput(r.start_date),
      isBusiness: r.is_business,
      isTaxRelevant: r.is_tax_relevant,
    });
    setEditOpen(true);
  }

  async function onEditSave(values: RecurringFormValues) {
    if (!selected) return;

    setSaving(true);
    try {
      const payload = {
        accountId: values.accountId,
        amount: signedAmount(values),
        description: values.description.trim(),
        category: values.category.trim(),
        intervalType: values.intervalType,
        dayOfMonth: values.intervalType === "MONTHLY" ? values.dayOfMonth : null,
        startDate: values.startDate,
        isBusiness: values.isBusiness,
        isTaxRelevant: values.isTaxRelevant,
      };

      const r = await fetch(`/api/recurring/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error("Update failed");

      setEditOpen(false);
      setSelected(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteConfirm() {
    if (!selected) return;

    setDeleting(true);
    try {
      const r = await fetch(`/api/recurring/${selected.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");

      setDeleteOpen(false);
      setSelected(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixkosten"
        description="Wiederkehrende Einnahmen/Ausgaben planen und pflegen."
        actions={
          <Button onClick={() => { ensureDefaultAccountInForm(); setCreateOpen(true); }}>
            Fixkosten anlegen
          </Button>
        }
      />

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Fixkosten-Position</DialogTitle>
          </DialogHeader>

          <form className="space-y-3" onSubmit={createForm.handleSubmit(onCreate)}>
            <div className="space-y-1">
              <Label>Konto</Label>
              <Select
                value={createForm.watch("accountId")}
                onValueChange={(v) => createForm.setValue("accountId", v, { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Richtung</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={createForm.watch("direction")}
                  onValueChange={(v) => v && createForm.setValue("direction", v as any, { shouldValidate: true })}
                >
                  <ToggleGroupItem value="EXPENSE" aria-label="Ausgabe">Ausgabe</ToggleGroupItem>
                  <ToggleGroupItem value="INCOME" aria-label="Einnahme">Einnahme</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="space-y-1">
                <Label>Betrag</Label>
                <Input {...createForm.register("amountAbs")} inputMode="decimal" placeholder="500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Intervall</Label>
                <Select
                  value={createForm.watch("intervalType")}
                  onValueChange={(v) => createForm.setValue("intervalType", v as any, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Wöchentlich</SelectItem>
                    <SelectItem value="MONTHLY">Monatlich</SelectItem>
                    <SelectItem value="YEARLY">Jährlich</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Startdatum</Label>
                <Input type="date" {...createForm.register("startDate")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tag im Monat</Label>
                <Input
                  {...createForm.register("dayOfMonth")}
                  disabled={createForm.watch("intervalType") !== "MONTHLY"}
                  inputMode="numeric"
                  placeholder="1"
                />
              </div>

              <div className="space-y-1">
                <Label>Kategorie</Label>
                <Input {...createForm.register("category")} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Beschreibung</Label>
              <Input {...createForm.register("description")} placeholder="Miete" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Checkbox
                  checked={createForm.watch("isBusiness")}
                  onCheckedChange={(v) => createForm.setValue("isBusiness", v === true, { shouldValidate: true })}
                  id="create-is-business"
                />
                <Label htmlFor="create-is-business" className="text-sm">Business</Label>
              </div>

              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Checkbox
                  checked={createForm.watch("isTaxRelevant")}
                  onCheckedChange={(v) => createForm.setValue("isTaxRelevant", v === true, { shouldValidate: true })}
                  id="create-is-tax"
                />
                <Label htmlFor="create-is-tax" className="text-sm">Steuerrelevant</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving}>Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fixkosten bearbeiten</DialogTitle>
          </DialogHeader>

          <form className="space-y-3" onSubmit={editForm.handleSubmit(onEditSave)}>
            <div className="space-y-1">
              <Label>Konto</Label>
              <Select
                value={editForm.watch("accountId")}
                onValueChange={(v) => editForm.setValue("accountId", v, { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Richtung</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={editForm.watch("direction")}
                  onValueChange={(v) => v && editForm.setValue("direction", v as any, { shouldValidate: true })}
                >
                  <ToggleGroupItem value="EXPENSE" aria-label="Ausgabe">Ausgabe</ToggleGroupItem>
                  <ToggleGroupItem value="INCOME" aria-label="Einnahme">Einnahme</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="space-y-1">
                <Label>Betrag</Label>
                <Input {...editForm.register("amountAbs")} inputMode="decimal" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Intervall</Label>
                <Select
                  value={editForm.watch("intervalType")}
                  onValueChange={(v) => editForm.setValue("intervalType", v as any, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Wöchentlich</SelectItem>
                    <SelectItem value="MONTHLY">Monatlich</SelectItem>
                    <SelectItem value="YEARLY">Jährlich</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Startdatum</Label>
                <Input type="date" {...editForm.register("startDate")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tag im Monat</Label>
                <Input
                  {...editForm.register("dayOfMonth")}
                  disabled={editForm.watch("intervalType") !== "MONTHLY"}
                  inputMode="numeric"
                />
              </div>

              <div className="space-y-1">
                <Label>Kategorie</Label>
                <Input {...editForm.register("category")} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Beschreibung</Label>
              <Input {...editForm.register("description")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Checkbox
                  checked={editForm.watch("isBusiness")}
                  onCheckedChange={(v) => editForm.setValue("isBusiness", v === true, { shouldValidate: true })}
                  id="edit-is-business"
                />
                <Label htmlFor="edit-is-business" className="text-sm">Business</Label>
              </div>

              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Checkbox
                  checked={editForm.watch("isTaxRelevant")}
                  onCheckedChange={(v) => editForm.setValue("isTaxRelevant", v === true, { shouldValidate: true })}
                  id="edit-is-tax"
                />
                <Label htmlFor="edit-is-tax" className="text-sm">Steuerrelevant</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving}>Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Overview: filters + totals + next up */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Filter" description="Schnell nach Konto oder Text filtern.">
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Konto</Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Alle</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Suche</Label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="z.B. Miete, Wohnen, Spotify…" />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAccountFilter("ALL");
                  setQuery("");
                }}
              >
                Zurücksetzen
              </Button>
              <div className="text-xs text-muted-foreground ml-auto">
                {filtered.length} Treffer
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Monatlicher Plan" description="Heuristik: WEEKLY×4, YEARLY÷12.">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Monthly (heuristisch)</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight">
                <Money value={sumMonthly} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{filtered.length} Positionen</div>
          </div>

          {perAccount.length > 1 ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-muted-foreground">Pro Konto</div>
              {perAccount.map((a) => (
                <div key={a.account_id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 truncate">{a.account_name}</div>
                  <div className="text-right font-medium">
                    <Money value={a.totalMonthly} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Next up" description="Nächste fällige Positionen (MVP).">
          {nextUp.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">Noch keine Fixkosten vorhanden.</div>
          ) : (
            <div className="space-y-3">
              {nextUp.map(({ r, nextDue, amountN }) => (
                <div key={r.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.account_name} · {intervalLabel(r.interval_type)} · {formatDateDE(nextDue)}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold">
                    <Money value={amountN} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* List: grouped by account (more overview when multiple accounts) */}
      <SectionCard title="Fixkosten" description="Nach Konto gruppiert (übersichtlicher bei mehreren Konten).">
        {itemsWithNext.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Noch keine Fixkosten angelegt.
          </div>
        ) : (
          <div className="space-y-4">
            {perAccount.map((acc) => {
              const accountMeta = accounts.find((a) => a.id === acc.account_id)
              const color = accountMeta?.color
              const group = itemsWithNext.filter((x) => x.r.account_id === acc.account_id);
              if (group.length === 0) return null;

              return (
                <div key={acc.account_id} className="rounded-xl border bg-card">
                  <div className="relative flex items-center justify-between gap-3 border-b px-4 py-3">
                    {color ? (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{ backgroundColor: color, opacity: 0.08 }}
                      />
                    ) : null}

                    <div className="relative min-w-0">
                      <div className="truncate text-sm font-semibold">{acc.account_name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {group.length} Positionen · Monatlich: <span className="font-medium"><Money value={acc.totalMonthly} /></span>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y">
                    {group.map(({ r, nextDue, amountN }) => (
                      <div key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{r.description}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{r.category}</Badge>
                            <Badge variant="outline">{intervalLabel(r.interval_type)}</Badge>
                            {r.interval_type === "MONTHLY" && r.day_of_month ? (
                              <Badge variant="outline">Tag {r.day_of_month}</Badge>
                            ) : null}
                            {r.is_business ? <Badge variant="outline">Business</Badge> : null}
                            {r.is_tax_relevant ? <Badge variant="outline">Steuer</Badge> : null}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Start: <span className="tabular-nums">{formatDateDE(toDateOnlyInput(r.start_date))}</span>
                            {" · "}
                            Next: <span className="tabular-nums">{formatDateDE(toDateOnlyInput(nextDue))}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Betrag</div>
                            <div className="mt-1 text-lg font-semibold">
                              <Money value={amountN} />
                            </div>
                          </div>

                          <RowActions
                            row={r}
                            editLabel="Bearbeiten"
                            deleteLabel="Löschen"
                            onEdit={(row) => openEdit(row)}
                            onDelete={(row) => {
                              setSelected(row);
                              setDeleteOpen(true);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelected(null);
        }}
        title="Fixkosten löschen?"
        description="Diese Position wird dauerhaft gelöscht."
        loading={deleting}
        onConfirm={onDeleteConfirm}
      />
    </div>
  );
}
