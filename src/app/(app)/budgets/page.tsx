'use client'

import { useEffect, useMemo, useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Money } from "@/components/money"
import { formatDateDE } from "@/lib/format"
import { toDateOnlyInput } from "@/lib/date-only"

import { RowActions } from "@/components/row-actions"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"

type Account = { id: string; name: string; color?: string }

type Budget = {
  id: string
  account_id: string | null
  account_name: string | null
  name: string
  category: string
  planned_amount: string
  used_amount: string
  period_type: "WEEKLY" | "MONTHLY"
  period_start: string
  period_end: string
}

const ALL = "ALL"

const BudgetFormSchema = z.object({
  accountId: z.string().nullable().default(null),
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(120),
  plannedAmount: z
    .string()
    .min(1)
    .transform((v) => Number(v))
    .refine((n) => Number.isFinite(n) && n > 0, "Ungültiger Betrag"),
  periodType: z.enum(["WEEKLY", "MONTHLY"]).default("MONTHLY"),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

type BudgetFormValues = z.infer<typeof BudgetFormSchema>

function clampPercent(p: number) {
  if (!Number.isFinite(p)) return 0
  return Math.max(0, Math.min(100, p))
}

function periodLabel(t: Budget["period_type"]) {
  return t === "WEEKLY" ? "Wöchentlich" : "Monatlich"
}

export default function BudgetsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [items, setItems] = useState<Budget[]>([])

  // filters
  const [accountFilter, setAccountFilter] = useState<string>(ALL)
  const [query, setQuery] = useState<string>("")

  // dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  // selection
  const [selected, setSelected] = useState<Budget | null>(null)

  // delete
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [saving, setSaving] = useState(false)

  async function load() {
    const [aRes, bRes] = await Promise.all([fetch("/api/accounts"), fetch("/api/budgets/overview")])
    const aJson = await aRes.json()
    const bJson = await bRes.json()
    setAccounts(aJson.items ?? [])
    setItems(bJson.items ?? [])
  }

  useEffect(() => {
    load().catch(console.error)
  }, [])

  const rows = useMemo(() => {
    return items.map((b) => {
      const planned = Number(b.planned_amount)
      const used = Number(b.used_amount)
      const available = planned - used
      const pct = planned > 0 ? clampPercent((used / planned) * 100) : 0
      return { ...b, planned, used, available, pct }
    })
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((b) => {
      if (accountFilter === "NULL") {
        if (b.account_id !== null) return false
      } else if (accountFilter !== ALL) {
        if ((b.account_id ?? "ALL") !== accountFilter) return false
      }
      if (!q) return true
      return (
        b.name.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        (b.account_name ?? "alle").toLowerCase().includes(q)
      )
    })
  }, [rows, accountFilter, query])

  const totals = useMemo(() => {
    const planned = filtered.reduce((acc, b) => acc + b.planned, 0)
    const used = filtered.reduce((acc, b) => acc + b.used, 0)
    const available = planned - used
    const pct = planned > 0 ? clampPercent((used / planned) * 100) : 0
    return { planned, used, available, pct }
  }, [filtered])

  const createForm = useForm<BudgetFormValues>({
    resolver: zodResolver(BudgetFormSchema),
    defaultValues: {
      accountId: null,
      name: "Essen",
      category: "Lebenshaltung",
      plannedAmount: "400",
      periodType: "MONTHLY",
      periodStart: toDateOnlyInput(new Date().toISOString()),
      periodEnd: toDateOnlyInput(new Date().toISOString()),
    },
  })

  const editForm = useForm<BudgetFormValues>({
    resolver: zodResolver(BudgetFormSchema),
    defaultValues: {
      accountId: null,
      name: "",
      category: "",
      plannedAmount: "100",
      periodType: "MONTHLY",
      periodStart: toDateOnlyInput(new Date().toISOString()),
      periodEnd: toDateOnlyInput(new Date().toISOString()),
    },
  })

  async function onCreate(values: BudgetFormValues) {
    setSaving(true)
    try {
      const payload = {
        accountId: values.accountId,
        name: values.name.trim(),
        category: values.category.trim(),
        plannedAmount: values.plannedAmount,
        periodType: values.periodType,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
      }

      const r = await fetch("/api/budgets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error("Create failed")

      setCreateOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  function openEdit(b: Budget) {
    setSelected(b)
    editForm.reset({
      accountId: b.account_id,
      name: b.name ?? "",
      category: b.category ?? "",
      plannedAmount: String(Number(b.planned_amount)),
      periodType: b.period_type,
      periodStart: toDateOnlyInput(b.period_start),
      periodEnd: toDateOnlyInput(b.period_end),
    })
    setEditOpen(true)
  }

  async function onEditSave(values: BudgetFormValues) {
    if (!selected) return
    setSaving(true)
    try {
      const payload = {
        accountId: values.accountId,
        name: values.name.trim(),
        category: values.category.trim(),
        plannedAmount: values.plannedAmount,
        periodType: values.periodType,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
      }

      const r = await fetch(`/api/budgets/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error("Update failed")

      setEditOpen(false)
      setSelected(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteConfirm() {
    if (!selected) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/budgets/${selected.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error("Delete failed")

      setDeleteOpen(false)
      setSelected(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description="Plan-Ebene: geplant / genutzt / verfügbar."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            Budget anlegen
          </Button>
        }
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Budget</DialogTitle>
          </DialogHeader>

          <form className="space-y-3" onSubmit={createForm.handleSubmit(onCreate)}>
            <div className="space-y-1">
              <Label>Konto (optional)</Label>
              <Select
                value={createForm.watch("accountId") ?? ALL}
                onValueChange={(v) => createForm.setValue("accountId", v === ALL ? null : v, { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Konten</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input {...createForm.register("name")} />
              </div>
              <div className="space-y-1">
                <Label>Kategorie</Label>
                <Input {...createForm.register("category")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Geplant</Label>
                <Input {...createForm.register("plannedAmount")} inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label>Periode</Label>
                <Select
                  value={createForm.watch("periodType")}
                  onValueChange={(v) => createForm.setValue("periodType", v as any, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Wöchentlich</SelectItem>
                    <SelectItem value="MONTHLY">Monatlich</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="date" {...createForm.register("periodStart")} />
              </div>
              <div className="space-y-1">
                <Label>Ende</Label>
                <Input type="date" {...createForm.register("periodEnd")} />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving}>Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) setSelected(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Budget bearbeiten</DialogTitle>
          </DialogHeader>

          <form className="space-y-3" onSubmit={editForm.handleSubmit(onEditSave)}>
            <div className="space-y-1">
              <Label>Konto (optional)</Label>
              <Select
                value={editForm.watch("accountId") ?? ALL}
                onValueChange={(v) => editForm.setValue("accountId", v === ALL ? null : v, { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Konten</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input {...editForm.register("name")} />
              </div>
              <div className="space-y-1">
                <Label>Kategorie</Label>
                <Input {...editForm.register("category")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Geplant</Label>
                <Input {...editForm.register("plannedAmount")} inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label>Periode</Label>
                <Select
                  value={editForm.watch("periodType")}
                  onValueChange={(v) => editForm.setValue("periodType", v as any, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Wöchentlich</SelectItem>
                    <SelectItem value="MONTHLY">Monatlich</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="date" {...editForm.register("periodStart")} />
              </div>
              <div className="space-y-1">
                <Label>Ende</Label>
                <Input type="date" {...editForm.register("periodEnd")} />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving}>Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Overview */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Filter" description="Nach Konto und Text filtern.">
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Konto</Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle</SelectItem>
                  <SelectItem value={"NULL"}>Nur „Alle Konten“-Budgets</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Suche</Label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="z.B. Essen, Wohnen…" />
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => { setAccountFilter(ALL); setQuery("") }}>
                Zurücksetzen
              </Button>
              <div className="text-xs text-muted-foreground ml-auto">
                {filtered.length} Treffer
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Gesamt" description="Geplant vs. genutzt (aktueller Filter).">
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Geplant</div>
                <div className="mt-1 text-2xl font-semibold"><Money value={totals.planned} /></div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Genutzt</div>
                <div className="mt-1 text-2xl font-semibold"><Money value={totals.used} /></div>
              </div>
            </div>

            <Progress value={totals.pct} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{totals.pct.toFixed(0)}%</span>
              <span>Verfügbar: <span className="font-medium"><Money value={totals.available} /></span></span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Hinweis" description="Was bedeutet „Genutzt“?">
          <div className="text-sm text-muted-foreground">
            Aktuell wird <span className="font-medium">used_amount</span> aus der API angezeigt.
            Wenn du willst, berechnen wir „Ist“ als Summe aus Transactions pro Zeitraum/Kategorie.
          </div>
        </SectionCard>
      </div>

      {/* List */}
      <SectionCard title="Budgets" description="Übersichtlich mit Progress und Edit/Delete.">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Keine Budgets gefunden.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((b) => {
              const labelAccount = b.account_name ?? "Alle Konten"
              const over = b.available < 0
              const start = formatDateDE(toDateOnlyInput(b.period_start))
              const end = formatDateDE(toDateOnlyInput(b.period_end))
              const accountMeta = b.account_id ? accounts.find((a) => a.id === b.account_id) : null
              const color = accountMeta?.color

              return (
                <div key={b.id} className="rounded-xl border bg-card">
                  <div className="relative flex items-start justify-between gap-3 border-b px-4 py-3">
                    {color ? (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{ backgroundColor: color, opacity: 0.08 }}
                      />
                    ) : null}

                    <div className="relative min-w-0">
                      <div className="truncate text-sm font-semibold">{b.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{b.category}</Badge>
                        <Badge variant="outline">{periodLabel(b.period_type)}</Badge>
                        <Badge variant="outline">{b.account_name ?? "Alle Konten"}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {formatDateDE(toDateOnlyInput(b.period_start))} → {formatDateDE(toDateOnlyInput(b.period_end))}
                      </div>
                    </div>

                    <div className="relative">
                      <RowActions
                        row={b}
                        editLabel="Bearbeiten"
                        deleteLabel="Löschen"
                        onEdit={(row) => openEdit(row)}
                        onDelete={(row) => { setSelected(row); setDeleteOpen(true) }}
                      />
                    </div>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    <Progress value={b.pct} />
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Geplant</div>
                        <div className="font-medium"><Money value={b.planned} /></div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Genutzt</div>
                        <div className="font-medium"><Money value={b.used} /></div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Verfügbar</div>
                        <div className={over ? "font-semibold text-destructive" : "font-semibold"}>
                          <Money value={b.available} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o)
          if (!o) setSelected(null)
        }}
        title="Budget löschen?"
        description="Dieses Budget wird dauerhaft gelöscht."
        loading={deleting}
        onConfirm={onDeleteConfirm}
      />
    </div>
  )
}
