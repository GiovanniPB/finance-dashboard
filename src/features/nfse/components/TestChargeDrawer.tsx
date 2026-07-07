import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { PagarmeAccount, SandboxChargeResult, SandboxSplitEntry } from "../api";
import {
  SANDBOX_METHOD_OPTIONS,
  SANDBOX_PIX_PAID_MAX_CENTS,
  SANDBOX_SCENARIO_OPTIONS,
} from "../constants";
import { useCreateSandboxCharge, useRecipients } from "../hooks";
import {
  emptySandboxChargeForm,
  sandboxChargeFormSchema,
  type SandboxChargeFormValues,
} from "../schema";
import { FieldToggle } from "./FieldToggle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: PagarmeAccount | null;
}

/** Distribui 100% igualmente entre N recebedores (resto no primeiro). */
function evenSplit(ids: string[]): Record<string, number> {
  if (ids.length === 0) return {};
  const base = Math.floor(100 / ids.length);
  const out: Record<string, number> = {};
  ids.forEach((id) => (out[id] = base));
  out[ids[0]] += 100 - base * ids.length;
  return out;
}

export function TestChargeDrawer({ open, onOpenChange, connection }: Props) {
  const create = useCreateSandboxCharge();
  const { data: recipients = [] } = useRecipients(connection?.id ?? null);
  const [result, setResult] = React.useState<SandboxChargeResult | null>(null);
  const [splitPct, setSplitPct] = React.useState<Record<string, number>>({});

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SandboxChargeFormValues>({
    resolver: zodResolver(sandboxChargeFormSchema),
    defaultValues: emptySandboxChargeForm(),
  });

  const method = watch("method");
  const useSplit = watch("useSplit");
  const scenarioOptions = SANDBOX_SCENARIO_OPTIONS[method] ?? [];

  // Reseta tudo ao (re)abrir.
  React.useEffect(() => {
    reset(emptySandboxChargeForm());
    setResult(null);
    setSplitPct({});
  }, [reset, open]);

  // Pix não suporta split no sandbox → desliga e reseta o cenário ao trocar de método.
  React.useEffect(() => {
    const first = (SANDBOX_SCENARIO_OPTIONS[method] ?? [])[0]?.value ?? "paid";
    setValue("scenario", first);
    if (method === "pix") setValue("useSplit", false);
  }, [method, setValue]);

  // Inicializa o split igualitário quando ligado.
  React.useEffect(() => {
    if (useSplit && recipients.length > 0 && Object.keys(splitPct).length === 0) {
      setSplitPct(evenSplit(recipients.map((r) => r.pagarme_recipient_id)));
    }
  }, [useSplit, recipients, splitPct]);

  if (!connection) return null;

  const splitTotal = Object.values(splitPct).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

  const onSubmit = handleSubmit((values) => {
    const amountCents = Math.round(values.amountReais * 100);
    const digits = (values.customerDocument ?? "").replace(/\D/gu, "");

    let split: SandboxSplitEntry[] | undefined;
    if (values.useSplit && method !== "pix") {
      if (splitTotal !== 100) {
        toast.error("O split precisa somar 100%", { description: `Soma atual: ${splitTotal}%` });
        return;
      }
      split = recipients.map((r) => ({
        recipientId: r.pagarme_recipient_id,
        amount: splitPct[r.pagarme_recipient_id] ?? 0,
        type: "percentage" as const,
      }));
    }

    const address =
      values.cep || values.line1 || values.city || values.uf
        ? {
            line_1: values.line1 ?? "",
            zip_code: (values.cep ?? "").replace(/\D/gu, ""),
            city: values.city ?? "",
            state: (values.uf ?? "").toUpperCase(),
          }
        : null;

    setResult(null);
    create.mutate(
      {
        accountId: connection.id,
        method,
        scenario: values.scenario,
        amountCents,
        description: values.description ?? null,
        customer: {
          name: values.customerName.trim(),
          email: values.customerEmail.trim(),
          document: digits || null,
          documentType: digits.length > 11 ? "CNPJ" : "CPF",
          address,
          phone:
            values.phoneArea && values.phoneNumber
              ? { areaCode: values.phoneArea, number: values.phoneNumber.replace(/\D/gu, "") }
              : null,
        },
        split,
      },
      {
        onSuccess: (res) => {
          setResult(res);
          toast.success("Cobrança de teste criada", {
            description: "Acompanhe a esteira na aba Notas.",
          });
        },
        onError: (err) => toast.error("Falha ao criar cobrança", { description: err.message }),
      },
    );
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FlaskConical className="size-4 text-accent" /> Cobrança de teste
          </SheetTitle>
          <SheetDescription>
            Cria uma cobrança real no <strong>sandbox</strong> do pagar.me ({connection.label}). Ela
            auto-liquida e o <code>charge.paid</code> percorre a esteira como em produção.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Método" error={errors.method?.message}>
                <Controller
                  control={control}
                  name="method"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SANDBOX_METHOD_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field label="Cenário" error={errors.scenario?.message}>
                <Controller
                  control={control}
                  name="scenario"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {scenarioOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field
              label="Valor (R$)"
              error={errors.amountReais?.message}
              hint={
                method === "pix"
                  ? `Pix pago exige ≤ R$ ${SANDBOX_PIX_PAID_MAX_CENTS / 100}; falha exige acima disso.`
                  : undefined
              }
            >
              <Input type="number" step="0.01" min="0" {...register("amountReais")} />
            </Field>

            <Field label="Descrição" error={errors.description?.message}>
              <Input placeholder="Cobrança de teste — esteira NFS-e" {...register("description")} />
            </Field>

            <div className="space-y-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
              <Label className="text-2xs tracking-wide text-text-subtle uppercase">Tomador</Label>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome" error={errors.customerName?.message}>
                  <Input {...register("customerName")} />
                </Field>
                <Field label="E-mail" error={errors.customerEmail?.message}>
                  <Input {...register("customerEmail")} />
                </Field>
              </div>
              <div className="grid grid-cols-[2fr_1fr_2fr] gap-3">
                <Field
                  label="Documento (CPF/CNPJ)"
                  error={errors.customerDocument?.message}
                  hint="obrigatório"
                >
                  <Input placeholder="só números" {...register("customerDocument")} />
                </Field>
                <Field label="DDD" error={errors.phoneArea?.message}>
                  <Input maxLength={3} {...register("phoneArea")} />
                </Field>
                <Field label="Telefone" error={errors.phoneNumber?.message}>
                  <Input placeholder="só números" {...register("phoneNumber")} />
                </Field>
              </div>
              <div className="grid grid-cols-[1fr_2fr] gap-3">
                <Field label="CEP" error={errors.cep?.message}>
                  <Input {...register("cep")} />
                </Field>
                <Field label="Logradouro (nº, rua, bairro)" error={errors.line1?.message}>
                  <Input {...register("line1")} />
                </Field>
              </div>
              <div className="grid grid-cols-[2fr_1fr] gap-3">
                <Field label="Município" error={errors.city?.message}>
                  <Input {...register("city")} />
                </Field>
                <Field label="UF" error={errors.uf?.message}>
                  <Input maxLength={2} {...register("uf")} />
                </Field>
              </div>
            </div>

            {method === "pix" ? (
              <p className="text-2xs flex items-start gap-1 text-text-subtle">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                Pix no sandbox não suporta split — a nota sai pela empresa dona da conexão.
              </p>
            ) : (
              <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                <Controller
                  control={control}
                  name="useSplit"
                  render={({ field }) => (
                    <FieldToggle
                      checked={field.value}
                      onChange={field.onChange}
                      label="Incluir split (recebedores da conta)"
                      description="Gera uma nota por empresa-recebedor mapeada."
                    />
                  )}
                />
                {useSplit &&
                  (recipients.length === 0 ? (
                    <p className="text-2xs text-warning">
                      Nenhum recebedor mapeado nesta conexão — cadastre em "Recebedores".
                    </p>
                  ) : (
                    <SplitEditor
                      recipients={recipients.map((r) => ({
                        id: r.pagarme_recipient_id,
                        label:
                          r.company?.trade_name ?? r.company?.legal_name ?? r.pagarme_recipient_id,
                      }))}
                      splitPct={splitPct}
                      onChange={setSplitPct}
                      total={splitTotal}
                    />
                  ))}
              </div>
            )}

            {result && <ResultCard result={result} />}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {result ? "Fechar" : "Cancelar"}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Gerar cobrança
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SplitEditor({
  recipients,
  splitPct,
  onChange,
  total,
}: {
  recipients: { id: string; label: string }[];
  splitPct: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  total: number;
}) {
  return (
    <div className="space-y-2">
      {recipients.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <span className="flex-1 truncate text-sm">{r.label}</span>
          <Input
            type="number"
            min="0"
            max="100"
            className="w-20"
            value={splitPct[r.id] ?? 0}
            onChange={(e) => onChange({ ...splitPct, [r.id]: Number(e.target.value) })}
          />
          <span className="text-2xs text-text-subtle">%</span>
        </div>
      ))}
      <p className={`text-2xs ${total === 100 ? "text-income" : "text-warning"}`}>
        Soma: {total}% {total === 100 ? "✓" : "(precisa ser 100%)"}
      </p>
    </div>
  );
}

function ResultCard({ result }: { result: SandboxChargeResult }) {
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-income/40 bg-income/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-income">
        <CheckCircle2 className="size-4" /> Pedido {result.order.code ?? result.order.orderId}
      </div>
      {result.order.charges.map((c, i) => (
        <div key={c.id ?? i} className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <code className="text-2xs">{c.id}</code>
            <Badge tone="info">{c.status ?? "—"}</Badge>
            <span className="text-2xs text-text-subtle">{c.paymentMethod}</span>
          </div>
          {c.qrCodeUrl && (
            <a
              href={c.qrCodeUrl}
              target="_blank"
              rel="noreferrer"
              className="text-2xs text-accent underline"
            >
              QR Code do Pix
            </a>
          )}
          {c.boletoUrl && (
            <a
              href={c.boletoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-2xs text-accent underline"
            >
              Boleto (PDF)
            </a>
          )}
        </div>
      ))}
      <p className="text-2xs text-text-subtle">
        Cartão paga na hora; Pix em segundos; boleto concilia pelo CEP. Acompanhe os jobs na aba
        Notas.
      </p>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="text-2xs text-text-subtle">{hint}</p>}
      {error && <p className="text-2xs text-expense">{error}</p>}
    </div>
  );
}
