'use client'

import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { Money } from "@/components/money"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { RowActions } from "@/components/row-actions"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"

import { formatDateDE } from "@/lib/format"
import { toDateOnlyInput, formatDateOnly } from "@/lib/date-only"

type Account = { id: string; name: string; type: "PRIVATE" | "BUSINESS" | "TAX"; color?: string }

type BudgetPick = {
  id: string
  name: string
  category: string
  account_id: string | null
  account_name: string | null
  period_start: string
  period_end: string
}

type TxItem = {
  kind: "NORMAL" | "TRANSFER"
  id: string
  transfer_group_id: string | null
  tx_date: string
  description: string
  category: string | null
  amount: number
  is_business: boolean
  is_tax_relevant: boolean

  account_id: string | null
  account_name: string | null

  from_account_id: string | null
  from_account_name: string | null
  to_account_id: string | null
  to_account_name: string | null
}

const ALL = "ALL"

const AmountAbsSchema = z.coerce
  .string()
  .min(1)
  .transform((s) => s.trim().replace(/\./g, "").replace(",", "."))
  .transform((s) => Number(s))
  .refine((n) => Number.isFinite(n) && n > 0, "Ungültiger Betrag");


const NormalFormSchema = z.object({
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z.string().uuid(),
  description: z.string().min(1).max(200),
  category: z.string().optional().transform((v) => (v?.trim() ? v.trim() : undefined)),
  direction: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
  amountAbs: AmountAbsSchema,
  isBusiness: z.boolean().default(false),
  isTaxRelevant: z.boolean().default(false),
})

type NormalFormValues = z.output<typeof NormalFormSchema>

const TransferFormSchema = z.object({
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  description: z.string().min(1).max(200),
  amountAbs: AmountAbsSchema,
  isBusiness: z.boolean().default(false),
  isTaxRelevant: z.boolean().default(false),
})

type TransferFormValues = z.output<typeof TransferFormSchema>

function todayISO() {
  return formatDateOnly(new Date())
}

function signedAmount(
  direction: "EXPENSE" | "INCOME" | undefined,
  amountAbs: number
) {
  const dir = direction ?? "EXPENSE"
  return dir === "EXPENSE" ? -amountAbs : amountAbs
}


export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [items, setItems] = useState<TxItem[]>([])

  // budgets for "template"
  const [budgets, setBudgets] = useState<BudgetPick[]>([])
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false)
  const [budgetPickId, setBudgetPickId] = useState<string>("")

  // filters
  const [accountFilter, setAccountFilter] = useState<string>(ALL)
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [businessFilter, setBusinessFilter] = useState<"ALL" | "true" | "false">("ALL")
  const [taxFilter, setTaxFilter] = useState<"ALL" | "true" | "false">("ALL")

  // create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [tab, setTab] = useState<"NORMAL" | "TRANSFER">("NORMAL")

  // edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<TxItem | null>(null)

  // delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [saving, setSaving] = useState(false)

  const createNormalForm = useForm<z.input<typeof NormalFormSchema>, any, z.output<typeof NormalFormSchema>>({
    resolver: zodResolver(NormalFormSchema),
    defaultValues: {
      txDate: todayISO(),
      accountId: "",
      description: "",
      category: "",
      direction: "EXPENSE",
      amountAbs: "20",
      isBusiness: false,
      isTaxRelevant: false,
    },
  })

  const createTransferForm = useForm<z.input<typeof TransferFormSchema>, any, z.output<typeof TransferFormSchema>>({
    resolver: zodResolver(TransferFormSchema),
    defaultValues: {
      txDate: todayISO(),
      fromAccountId: "",
      toAccountId: "",
      description: "",
      amountAbs: 20,
      isBusiness: false,
      isTaxRelevant: false,
    },
  })

  const editNormalForm = useForm<z.input<typeof NormalFormSchema>, any, z.output<typeof NormalFormSchema>>({
    resolver: zodResolver(NormalFormSchema),
    defaultValues: {
      txDate: todayISO(),
      accountId: "",
      description: "",
      category: "",
      direction: "EXPENSE",
      amountAbs: "20",
      isBusiness: false,
      isTaxRelevant: false,
    },
  })

  function ensureDefaultAccounts(accs: Account[]) {
    if (!accs.length) return

    if (!createNormalForm.getValues("accountId")) createNormalForm.setValue("accountId", accs[0].id)
    if (!createTransferForm.getValues("fromAccountId")) createTransferForm.setValue("fromAccountId", accs[0].id)
    if (!createTransferForm.getValues("toAccountId"))
      createTransferForm.setValue("toAccountId", accs.length > 1 ? accs[1].id : accs[0].id)
  }

  async function load() {
    const aRes = await fetch("/api/accounts")
    const aJson = await aRes.json()
    const accs: Account[] = aJson.items ?? []
    setAccounts(accs)
    ensureDefaultAccounts(accs)

    const sp = new URLSearchParams()
    if (accountFilter !== ALL) sp.set("accountId", accountFilter)
    if (categoryFilter.trim()) sp.set("category", categoryFilter.trim())
    if (businessFilter !== "ALL") sp.set("isBusiness", businessFilter)
    if (taxFilter !== "ALL") sp.set("isTaxRelevant", taxFilter)

    const tRes = await fetch(`/api/transactions?${sp.toString()}`)
    const tJson = await tRes.json()
    setItems(tJson.items ?? [])

    // budgets for template dialog (small list)
    const bRes = await fetch(`/api/budgets`)
    const bJson = await bRes.json()
    setBudgets(bJson.items ?? [])
    if (!budgetPickId && (bJson.items?.length ?? 0) > 0) setBudgetPickId(bJson.items[0].id)
  }

  useEffect(() => {
    load().catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => {
    return items.map((t) => {
      const amt = t.amount
      const isTransfer = t.kind === "TRANSFER"
      const key = (t.kind === "TRANSFER" ? t.transfer_group_id : t.id) ?? t.id
      const accountText =
        t.kind === "TRANSFER"
          ? `${t.from_account_name ?? "—"} → ${t.to_account_name ?? "—"}`
          : t.account_name ?? "—"
      return { ...t, key, amt, isTransfer, accountText }
    })
  }, [items])

  function resetCreateFormsForOpen() {
    // keep date, reset text-ish fields
    createNormalForm.setValue("txDate", todayISO())
    createNormalForm.setValue("description", "")
    createNormalForm.setValue("category", "")
    createNormalForm.setValue("direction", "EXPENSE")
    createNormalForm.setValue("amountAbs", "20")
    createNormalForm.setValue("isBusiness", false)
    createNormalForm.setValue("isTaxRelevant", false)

    createTransferForm.setValue("txDate", todayISO())
    createTransferForm.setValue("description", "")
    createTransferForm.setValue("amountAbs", "20")
    createTransferForm.setValue("isBusiness", false)
    createTransferForm.setValue("isTaxRelevant", false)
  }

  function openCreate(kind: "NORMAL" | "TRANSFER") {
    setTab(kind)
    resetCreateFormsForOpen()
    setCreateOpen(true)
  }

  function applyBudgetTemplate(b: BudgetPick) {
    setTab("NORMAL")
    resetCreateFormsForOpen()
    createNormalForm.setValue("direction", "EXPENSE")
    createNormalForm.setValue("description", b.name)
    createNormalForm.setValue("category", b.category)
    if (b.account_id) createNormalForm.setValue("accountId", b.account_id)
    createNormalForm.setValue("txDate", todayISO())
    setCreateOpen(true)
  }

  async function onCreateSubmit() {
    setSaving(true)
    try {
      if (tab === "NORMAL") {
        await createNormalForm.handleSubmit(async (v) => {
          const payload = {
            kind: "NORMAL" as const,
            accountId: v.accountId,
            amount: signedAmount(v.direction ?? "EXPENSE", v.amountAbs),
            description: v.description,
            category: v.category || undefined,
            tags: [],
            isBusiness: v.isBusiness,
            isTaxRelevant: v.isTaxRelevant,
            txDate: v.txDate,
          }

          const r = await fetch("/api/transactions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
          if (!r.ok) throw new Error("Create failed")
        })()
      } else {
        await createTransferForm.handleSubmit(async (v) => {
          const amt = Math.abs(v.amountAbs || 0)

          const payload = {
            kind: "TRANSFER" as const,
            fromAccountId: v.fromAccountId,
            toAccountId: v.toAccountId,
            amount: amt,
            description: v.description,
            category: "Transfer",
            tags: [],
            isBusiness: v.isBusiness,
            isTaxRelevant: v.isTaxRelevant,
            txDate: v.txDate,
          }

          const r = await fetch("/api/transactions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
          if (!r.ok) throw new Error("Create failed")
        })()
      }

      setCreateOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  function openEdit(t: TxItem) {
    setSelectedTx(t)
    if (t.kind === "TRANSFER") {
      // MVP: transfers only delete/recreate (edit later)
      setDeleteOpen(true)
      return
    }

    const amountN = t.amount
    editNormalForm.reset({
      txDate: toDateOnlyInput(t.tx_date),
      accountId: t.account_id ?? "",
      description: t.description ?? "",
      category: t.category ?? "",
      direction: amountN < 0 ? "EXPENSE" : "INCOME",
      amountAbs: String(Math.abs(amountN || 0)),
      isBusiness: !!t.is_business,
      isTaxRelevant: !!t.is_tax_relevant,
    })
    setEditOpen(true)
  }

  async function onEditSave() {
    if (!selectedTx || selectedTx.kind !== "NORMAL") return

    setSaving(true)
    try {
      await editNormalForm.handleSubmit(async (v) => {
        const payload = {
          accountId: v.accountId,
          amount: signedAmount(v.direction, v.amountAbs),
          description: v.description,
          category: v.category || null,
          isBusiness: v.isBusiness,
          isTaxRelevant: v.isTaxRelevant,
          txDate: v.txDate,
        }

        const r = await fetch(`/api/transactions/${selectedTx.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error("Update failed")

        setEditOpen(false)
        setSelectedTx(null)
        await load()
      })()
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteConfirm() {
    if (!selectedTx) return

    setDeleting(true)
    try {
      const url =
        selectedTx.kind === "TRANSFER"
          ? `/api/transfers/${selectedTx.transfer_group_id}`
          : `/api/transactions/${selectedTx.id}`

      const r = await fetch(url, { method: "DELETE" })
      if (!r.ok) throw new Error("Delete failed")

      setDeleteOpen(false)
      setSelectedTx(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaktionen"
        description="Alltagsebene: echte Buchungen inkl. Transfers, filterbar nach Konto/Kategorie/Flags."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { setBudgetDialogOpen(true) }}>
              Aus Budget
            </Button>
            <Button onClick={() => openCreate("NORMAL")}>
              Hinzufügen
            </Button>
          </div>
        }
      />

      {/* Budget template dialog */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaktion aus Budget</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Budget</Label>
              <Select value={budgetPickId} onValueChange={setBudgetPickId}>
                <SelectTrigger><SelectValue placeholder="Budget wählen" /></SelectTrigger>
                <SelectContent>
                  {budgets.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} · {b.category} · {b.account_name ?? "Alle"} · {formatDateDE(toDateOnlyInput(b.period_start))}–{formatDateDE(toDateOnlyInput(b.period_end))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                const b = budgets.find((x) => x.id === budgetPickId)
                if (!b) return
                setBudgetDialogOpen(false)
                applyBudgetTemplate(b)
              }}
              disabled={!budgetPickId}
            >
              Weiter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Transaktion</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="NORMAL">Normal</TabsTrigger>
              <TabsTrigger value="TRANSFER">Transfer</TabsTrigger>
            </TabsList>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Datum</Label>
                  <Input
                    type="date"
                    value={tab === "NORMAL" ? createNormalForm.watch("txDate") : createTransferForm.watch("txDate")}
                    onChange={(e) => {
                      if (tab === "NORMAL") createNormalForm.setValue("txDate", e.target.value, { shouldValidate: true })
                      else createTransferForm.setValue("txDate", e.target.value, { shouldValidate: true })
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Betrag</Label>
                  <Input
                    inputMode="decimal"
                    value={tab === "NORMAL" ? String(createNormalForm.watch("amountAbs") ?? "") : String(createTransferForm.watch("amountAbs") ?? "")}
                    onChange={(e) => {
                      if (tab === "NORMAL") createNormalForm.setValue("amountAbs", e.target.value, { shouldValidate: true })
                      else createTransferForm.setValue("amountAbs", e.target.value, { shouldValidate: true })
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Beschreibung</Label>
                <Input
                  value={tab === "NORMAL" ? createNormalForm.watch("description") : createTransferForm.watch("description")}
                  onChange={(e) => {
                    if (tab === "NORMAL") createNormalForm.setValue("description", e.target.value, { shouldValidate: true })
                    else createTransferForm.setValue("description", e.target.value, { shouldValidate: true })
                  }}
                />
              </div>

              {tab === "NORMAL" ? (
                <>
                  <div className="space-y-1">
                    <Label>Kategorie (optional)</Label>
                    <Input
                      value={(createNormalForm.watch("category") as any) ?? ""}
                      onChange={(e) => createNormalForm.setValue("category", e.target.value, { shouldValidate: true })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Typ</Label>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        value={createNormalForm.watch("direction")}
                        onValueChange={(v) => v && createNormalForm.setValue("direction", v as any, { shouldValidate: true })}
                      >
                        <ToggleGroupItem value="EXPENSE" aria-label="Ausgabe">Ausgabe</ToggleGroupItem>
                        <ToggleGroupItem value="INCOME" aria-label="Einnahme">Einnahme</ToggleGroupItem>
                      </ToggleGroup>
                    </div>

                    <div className="space-y-1">
                      <Label>Konto</Label>
                      <Select
                        value={createNormalForm.watch("accountId")}
                        onValueChange={(v) => createNormalForm.setValue("accountId", v, { shouldValidate: true })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <Checkbox
                        checked={!!createNormalForm.watch("isBusiness")}
                        onCheckedChange={(v) => createNormalForm.setValue("isBusiness", v === true, { shouldValidate: true })}
                        id="create-tx-business"
                      />
                      <Label htmlFor="create-tx-business" className="text-sm">Business</Label>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <Checkbox
                        checked={!!createNormalForm.watch("isTaxRelevant")}
                        onCheckedChange={(v) => createNormalForm.setValue("isTaxRelevant", v === true, { shouldValidate: true })}
                        id="create-tx-tax"
                      />
                      <Label htmlFor="create-tx-tax" className="text-sm">Steuerrelevant</Label>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Von</Label>
                      <Select
                        value={createTransferForm.watch("fromAccountId")}
                        onValueChange={(v) => createTransferForm.setValue("fromAccountId", v, { shouldValidate: true })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Nach</Label>
                      <Select
                        value={createTransferForm.watch("toAccountId")}
                        onValueChange={(v) => createTransferForm.setValue("toAccountId", v, { shouldValidate: true })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <Checkbox
                        checked={!!createTransferForm.watch("isBusiness")}
                        onCheckedChange={(v) => createTransferForm.setValue("isBusiness", v === true, { shouldValidate: true })}
                        id="create-tr-business"
                      />
                      <Label htmlFor="create-tr-business" className="text-sm">Business</Label>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <Checkbox
                        checked={!!createTransferForm.watch("isTaxRelevant")}
                        onCheckedChange={(v) => createTransferForm.setValue("isTaxRelevant", v === true, { shouldValidate: true })}
                        id="create-tr-tax"
                      />
                      <Label htmlFor="create-tr-tax" className="text-sm">Steuerrelevant</Label>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Tabs>

          <DialogFooter>
            <Button disabled={saving} onClick={onCreateSubmit}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit NORMAL dialog (Transfers: MVP delete-only) */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) setSelectedTx(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaktion bearbeiten</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input type="date" {...editNormalForm.register("txDate")} />
              </div>
              <div className="space-y-1">
                <Label>Betrag</Label>
                <Input inputMode="decimal" {...editNormalForm.register("amountAbs")} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Beschreibung</Label>
              <Input {...editNormalForm.register("description")} />
            </div>

            <div className="space-y-1">
              <Label>Kategorie (optional)</Label>
              <Input
                value={(editNormalForm.watch("category") as any) ?? ""}
                onChange={(e) => editNormalForm.setValue("category", e.target.value, { shouldValidate: true })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Typ</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={editNormalForm.watch("direction")}
                  onValueChange={(v) => v && editNormalForm.setValue("direction", v as any, { shouldValidate: true })}
                >
                  <ToggleGroupItem value="EXPENSE" aria-label="Ausgabe">Ausgabe</ToggleGroupItem>
                  <ToggleGroupItem value="INCOME" aria-label="Einnahme">Einnahme</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="space-y-1">
                <Label>Konto</Label>
                <Select
                  value={editNormalForm.watch("accountId")}
                  onValueChange={(v) => editNormalForm.setValue("accountId", v, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Checkbox
                  checked={!!editNormalForm.watch("isBusiness")}
                  onCheckedChange={(v) => editNormalForm.setValue("isBusiness", v === true, { shouldValidate: true })}
                  id="edit-tx-business"
                />
                <Label htmlFor="edit-tx-business" className="text-sm">Business</Label>
              </div>

              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Checkbox
                  checked={!!editNormalForm.watch("isTaxRelevant")}
                  onCheckedChange={(v) => editNormalForm.setValue("isTaxRelevant", v === true, { shouldValidate: true })}
                  id="edit-tx-tax"
                />
                <Label htmlFor="edit-tx-tax" className="text-sm">Steuerrelevant</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button disabled={saving} onClick={onEditSave}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SectionCard title="Filter" description="Nutze Filter, um schnell die relevanten Buchungen zu finden.">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Konto</Label>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Kategorie</Label>
            <Input value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} placeholder="z.B. Essen" />
          </div>

          <div className="space-y-1">
            <Label>Business</Label>
            <Select value={businessFilter} onValueChange={(v) => setBusinessFilter(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Alle</SelectItem>
                <SelectItem value="false">Privat</SelectItem>
                <SelectItem value="true">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Steuer</Label>
            <Select value={taxFilter} onValueChange={(v) => setTaxFilter(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Alle</SelectItem>
                <SelectItem value="false">Nein</SelectItem>
                <SelectItem value="true">Ja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-4 flex items-center gap-2">
            <Button onClick={() => load()}>Filter anwenden</Button>
            <Button
              variant="outline"
              onClick={() => {
                setAccountFilter(ALL)
                setCategoryFilter("")
                setBusinessFilter("ALL")
                setTaxFilter("ALL")
              }}
            >
              Zurücksetzen
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Buchungen" description="Max 500 · sortiert nach Datum">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Datum</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead className="w-[240px]">Konto</TableHead>
                <TableHead className="w-[160px]">Kategorie</TableHead>
                <TableHead className="w-[160px]">Flags</TableHead>
                <TableHead className="w-[140px] text-right">Betrag</TableHead>
                <TableHead className="w-[44px]" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Keine Transaktionen gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((t) => {
                  const amountN = t.amount
                  return (
                    <TableRow key={t.key}>
                      <TableCell className="align-top font-medium">
                        {formatDateDE(toDateOnlyInput(t.tx_date))}
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="font-medium">{t.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.kind === "TRANSFER" ? "Transfer" : "Normal"}
                        </div>
                      </TableCell>

                      <TableCell className="align-top">{t.accountText}</TableCell>

                      <TableCell className="align-top">
                        {t.category ? (
                          <Badge variant="secondary">{t.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{t.is_business ? "Business" : "Privat"}</Badge>
                          {t.is_tax_relevant ? <Badge variant="outline">Steuer</Badge> : null}
                        </div>
                      </TableCell>

                      <TableCell className="align-top text-right">
                        <Money value={amountN} />
                      </TableCell>

                      <TableCell className="align-top text-right">
                        <RowActions
                          row={t}
                          editLabel={t.kind === "TRANSFER" ? "Transfer löschen/neu" : "Bearbeiten"}
                          deleteLabel="Löschen"
                          onEdit={() => openEdit(t)}
                          onDelete={() => { setSelectedTx(t); setDeleteOpen(true) }}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o)
          if (!o) setSelectedTx(null)
        }}
        title={selectedTx?.kind === "TRANSFER" ? "Transfer löschen?" : "Transaktion löschen?"}
        description="Diese Aktion kann nicht rückgängig gemacht werden."
        loading={deleting}
        onConfirm={onDeleteConfirm}
      />
    </div>
  )
}
