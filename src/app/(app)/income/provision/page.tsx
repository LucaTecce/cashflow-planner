'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { apiGet, apiSend } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

type Rule = {
  id: string;
  name: string;
  is_active: boolean;
  rule_json: any;
  created_at: string;
};

type RuleVersion = {
  id: string;
  valid_period: string; // text like "[2026-01-01,)" [web:201]
  rule_json: any;
  created_at: string;
};

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(120),
  ruleJson: z.string().default('{}'),
});
type CreateRuleInput = z.input<typeof CreateRuleSchema>;
type CreateRuleOutput = z.output<typeof CreateRuleSchema>;

const CreateVersionSchema = z.object({
  validFrom: z.string().min(1),
  validTo: z.string().optional().transform((s) => (s?.trim() ? s : null)),
  ruleJson: z.string().default('{}'),
});
type CreateVersionInput = z.input<typeof CreateVersionSchema>;
type CreateVersionOutput = z.output<typeof CreateVersionSchema>;

function safeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function IncomeProvisionPage() {
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [versions, setVersions] = React.useState<Record<string, RuleVersion[]>>({});
  const [loading, setLoading] = React.useState(true);

  const [createRuleOpen, setCreateRuleOpen] = React.useState(false);
  const [versionFor, setVersionFor] = React.useState<Rule | null>(null);

  const createRuleForm = useForm<CreateRuleInput, unknown, CreateRuleOutput>({
    resolver: zodResolver(CreateRuleSchema),
    defaultValues: { name: '', ruleJson: '{}' },
  });

  const createVersionForm = useForm<CreateVersionInput, unknown, CreateVersionOutput>({
    resolver: zodResolver(CreateVersionSchema),
    defaultValues: { validFrom: new Date().toISOString().slice(0, 10), validTo: '', ruleJson: '{}' },
  });

  async function reload() {
    setLoading(true);
    const data = await apiGet<{ items: Rule[] }>('/api/income/provision-rules');
    setRules(data.items);
    setLoading(false);
  }

  async function loadVersions(ruleId: string) {
    const data = await apiGet<{ items: RuleVersion[] }>(`/api/income/provision-rules/${ruleId}/versions`);
    setVersions((prev) => ({ ...prev, [ruleId]: data.items }));
  }

  React.useEffect(() => {
    void reload();
  }, []);

  async function onCreateRule(values: CreateRuleOutput) {
    const obj = safeParseJson(values.ruleJson);
    if (!obj) {
      createRuleForm.setError('ruleJson', { message: 'Ungültiges JSON' });
      return;
    }

    await apiSend('/api/income/provision-rules', {
      method: 'POST',
      body: JSON.stringify({ name: values.name, ruleJson: obj, isActive: true }),
    });

    setCreateRuleOpen(false);
    createRuleForm.reset({ name: '', ruleJson: '{}' });
    await reload();
  }

  async function onCreateVersion(values: CreateVersionOutput) {
    if (!versionFor) return;
    const obj = safeParseJson(values.ruleJson);
    if (!obj) {
      createVersionForm.setError('ruleJson', { message: 'Ungültiges JSON' });
      return;
    }

    await apiSend(`/api/income/provision-rules/${versionFor.id}/versions`, {
      method: 'POST',
      body: JSON.stringify({
        validFrom: values.validFrom,
        validTo: values.validTo,
        ruleJson: obj,
      }),
    });

    setVersionFor(null);
    createVersionForm.reset({ validFrom: new Date().toISOString().slice(0, 10), validTo: '', ruleJson: '{}' });
    await loadVersions(versionFor.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Provision</h2>
          <p className="text-sm text-muted-foreground">
            Regeln sind versioniert (Gültigkeitszeitraum) – überlappende Zeiträume sind nicht erlaubt.
          </p>
        </div>

        <Dialog open={createRuleOpen} onOpenChange={setCreateRuleOpen}>
          <DialogTrigger asChild>
            <Button>Neue Regel</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Regel anlegen</DialogTitle>
            </DialogHeader>
            <Form {...createRuleForm}>
              <form onSubmit={createRuleForm.handleSubmit(onCreateRule)} className="space-y-4">
                <FormField
                  control={createRuleForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. 10% vom Umsatz" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createRuleForm.control}
                  name="ruleJson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Definition (JSON)</FormLabel>
                      <FormControl>
                        <Textarea rows={6} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createRuleForm.formState.isSubmitting}>
                    Speichern
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Lade…</div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <div key={r.id} className="rounded border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">{r.name}</div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await loadVersions(r.id);
                    }}
                  >
                    Versionen laden
                  </Button>
                  <Button
                    onClick={() => {
                      setVersionFor(r);
                      createVersionForm.reset({
                        validFrom: new Date().toISOString().slice(0, 10),
                        validTo: '',
                        ruleJson: JSON.stringify(r.rule_json ?? {}, null, 2),
                      });
                    }}
                  >
                    Version hinzufügen
                  </Button>
                </div>
              </div>

              {versions[r.id]?.length ? (
                <div className="text-sm space-y-1">
                  {versions[r.id].map((v) => (
                    <div key={v.id} className="flex items-center justify-between">
                      <div className="text-muted-foreground">{v.valid_period}</div>
                      <div className="text-muted-foreground">created {new Date(v.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Noch keine Versionen geladen.</div>
              )}
            </div>
          ))}
          {rules.length === 0 && <div className="text-sm text-muted-foreground">Keine Regeln.</div>}
        </div>
      )}

      <Dialog open={!!versionFor} onOpenChange={(o) => !o && setVersionFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version hinzufügen</DialogTitle>
          </DialogHeader>

          <Form {...createVersionForm}>
            <form onSubmit={createVersionForm.handleSubmit(onCreateVersion)} className="space-y-4">
              <FormField
                control={createVersionForm.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gültig ab</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createVersionForm.control}
                name="validTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gültig bis (optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createVersionForm.control}
                name="ruleJson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Definition (JSON)</FormLabel>
                    <FormControl>
                      <Textarea rows={8} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit" disabled={createVersionForm.formState.isSubmitting}>
                  Speichern
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
