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

import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Money } from "@/components/money";
import { maskIban, normalizeIban } from "@/lib/iban";

import { RowActions } from "@/components/row-actions";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

import { Copy } from "lucide-react";

type Account = {
  id: string;
  name: string;
  type: 'PRIVATE' | 'BUSINESS' | 'TAX';
  color: string;

  iban: string | null;

  initial_balance: string;
  movement: string;
  balance: string;
};

function accountTypeLabel(t: Account["type"]) {
  if (t === "PRIVATE") return "Privat";
  if (t === "BUSINESS") return "Business";
  return "Steuer";
}

const CreateAccountFormSchema = z.object({
  name: z.string().min(1, "Name fehlt").max(120),
  iban: z.string().optional(),
  type: z.enum(["PRIVATE", "BUSINESS", "TAX"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Ungültige Farbe"),
  initialBalance: z.string().optional(),
});

type CreateAccountFormValues = z.infer<typeof CreateAccountFormSchema>;

const EditAccountFormSchema = z.object({
  name: z.string().min(1, "Name fehlt").max(120),
  iban: z.string().optional(),
  type: z.enum(["PRIVATE", "BUSINESS", "TAX"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Ungültige Farbe"),
  initialBalance: z
    .string()
    .default("0")
    .refine((v) => v.trim()==="" || Number.isFinite(Number(v.replace(",", "."))), "Ungültiger Startsaldo"),
});

type EditAccountFormValues = z.input<typeof EditAccountFormSchema>;

export default function AccountsPage() {
  const [items, setItems] = useState<Account[]>([]);

  // create dialog
  const [createOpen, setCreateOpen] = useState(false);

  // edit dialog (global)
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);

  // delete dialog (global)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const r = await fetch('/api/accounts/balances');
    const j = await r.json();
    setItems(j.items ?? []);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const stats = useMemo(() => {
    const total = items.reduce((acc, a) => acc + Number(a.balance || 0), 0);
    return { total };
  }, [items]);

  const createForm = useForm<CreateAccountFormValues>({
    resolver: zodResolver(CreateAccountFormSchema),
    defaultValues: {
      name: "",
      iban: "",
      type: "PRIVATE",
      color: "#3b82f6",
      initialBalance: "0",
    },
  });

  const editForm = useForm<EditAccountFormValues>({
    resolver: zodResolver(EditAccountFormSchema),
    defaultValues: {
      name: "",
      iban: "",
      type: "PRIVATE",
      color: "#3b82f6",
      initialBalance: "0",
    },
  });

  async function onCreate(values: CreateAccountFormValues) {
    setSaving(true);
    try {
      const payload = {
        name: values.name.trim(),
        type: values.type,
        color: values.color,
        initialBalance: values.initialBalance,
        iban: values.iban?.trim() ? values.iban : undefined,
      };

      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        // optional: read server error message
        throw new Error("Create failed");
      }

      setCreateOpen(false);
      createForm.reset({
        name: "",
        iban: "",
        type: "PRIVATE",
        color: "#3b82f6",
        initialBalance: "0",
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  function openEdit(a: Account) {
    setSelected(a);
    editForm.reset({
      name: a.name ?? "",
      iban: a.iban ?? "",
      type: a.type,
      color: a.color ?? "#3b82f6",
      initialBalance: String(Number(a.initial_balance || 0)),
    });
    setEditOpen(true);
  }

  async function onEditSave(values: EditAccountFormValues) {
    if (!selected) return;

    setSaving(true);
    try {
      const payload = {
        name: values.name.trim(),
        type: values.type,
        color: values.color,
        initialBalance: values.initialBalance,
        iban: values.iban?.trim() ? values.iban : null, // null = clear
      };

      const r = await fetch(`/api/accounts/${selected.id}`, {
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
      const r = await fetch(`/api/accounts/${selected.id}`, { method: "DELETE" });
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
        title="Konten"
        description="Übersicht über Startsaldo, Bewegung und aktuellen Kontostand."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            Konto anlegen
          </Button>
        }
      />

      {/* Create Dialog (global, 1x) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Konto</DialogTitle>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={createForm.handleSubmit(onCreate)}
          >
            <div className="space-y-1">
              <Label>Name</Label>
              <Input {...createForm.register("name")} placeholder="Giro Privat" />
              {createForm.formState.errors.name?.message ? (
                <p className="text-sm text-destructive">{createForm.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>IBAN</Label>
              <Input {...createForm.register("iban")} placeholder="DE00 0000 0000 0000 0000 00" />
              {createForm.formState.errors.iban?.message ? (
                <p className="text-sm text-destructive">{createForm.formState.errors.iban.message}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>Typ</Label>
              <Select
                value={createForm.watch("type")}
                onValueChange={(v) => createForm.setValue("type", v as any, { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">Privat</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                  <SelectItem value="TAX">Steuer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Farbe</Label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input
                  {...createForm.register("color")}
                  placeholder="#3b82f6"
                />
                <Input
                  type="color"
                  value={createForm.watch("color")}
                  onChange={(e) => createForm.setValue("color", e.target.value, { shouldValidate: true })}
                  className="h-10 w-12 p-1"
                />
              </div>
              {createForm.formState.errors.color?.message ? (
                <p className="text-sm text-destructive">{createForm.formState.errors.color.message}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>Startsaldo</Label>
              <Input
                {...createForm.register("initialBalance")}
                placeholder="0"
                inputMode="decimal"
              />
              {createForm.formState.errors.initialBalance?.message ? (
                <p className="text-sm text-destructive">{createForm.formState.errors.initialBalance.message}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving}>
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog (global, 1x) */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konto bearbeiten</DialogTitle>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={editForm.handleSubmit(onEditSave)}
          >
            <div className="space-y-1">
              <Label>Name</Label>
              <Input {...editForm.register("name")} />
              {editForm.formState.errors.name?.message ? (
                <p className="text-sm text-destructive">{editForm.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>IBAN</Label>
              <Input {...editForm.register("iban")} />
              {editForm.formState.errors.iban?.message ? (
                <p className="text-sm text-destructive">{editForm.formState.errors.iban.message}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>Typ</Label>
              <Select
                value={editForm.watch("type")}
                onValueChange={(v) => editForm.setValue("type", v as any, { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">Privat</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                  <SelectItem value="TAX">Steuer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Farbe</Label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input {...editForm.register("color")} />
                <Input
                  type="color"
                  value={editForm.watch("color")}
                  onChange={(e) => editForm.setValue("color", e.target.value, { shouldValidate: true })}
                  className="h-10 w-12 p-1"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Startsaldo</Label>
              <Input {...editForm.register("initialBalance")} inputMode="decimal" />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving}>
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SectionCard title="Gesamt" description="Summe aller Kontostände (inkl. Startsaldo + Buchungen).">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Total Balance</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">
              <Money value={stats.total} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{items.length} Konten</div>
        </div>
      </SectionCard>

      <SectionCard title="Konten" description="Kontostand, Startsaldo, Bewegung und IBAN (masked).">
        {items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Noch keine Konten angelegt.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((a) => {
              const bal = Number(a.balance || 0);
              const movement = Number(a.movement || 0);
              const initial = Number(a.initial_balance || 0);

              return (
                <div key={a.id} className="rounded-xl border bg-card">
                  <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: a.color }}
                        />
                        <div className="truncate text-sm font-semibold">{a.name}</div>
                      </div>

                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline">{accountTypeLabel(a.type)}</Badge>
                      </div>

                      {a.iban ? (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">
                            IBAN:{" "}
                            <span className="font-mono text-foreground/90">
                              {maskIban(a.iban)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={async () => {
                              await navigator.clipboard.writeText(normalizeIban(a.iban))
                            }}
                            aria-label="IBAN kopieren"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    <RowActions
                      row={a}
                      editLabel="Bearbeiten"
                      deleteLabel="Löschen"
                      onEdit={(row) => openEdit(row)}
                      onDelete={(row) => {
                        setSelected(row);
                        setDeleteOpen(true);
                      }}
                    />
                  </div>

                  <div className="px-4 py-4">
                    <div className="text-xs text-muted-foreground">Kontostand</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight">
                      <Money value={bal} />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border bg-muted/30 px-3 py-2">
                        <div className="text-xs text-muted-foreground">Start</div>
                        <div className="mt-1 tabular-nums">{initial.toFixed(2)} €</div>
                      </div>

                      <div className="rounded-lg border bg-muted/30 px-3 py-2">
                        <div className="text-xs text-muted-foreground">Bewegung</div>
                        <div className="mt-1">
                          <Money value={movement} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Global Confirm Delete (1x) */}
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelected(null);
        }}
        title="Konto löschen?"
        description="Dieses Konto wird dauerhaft gelöscht."
        loading={deleting}
        onConfirm={onDeleteConfirm}
      />
    </div>
  );
}
