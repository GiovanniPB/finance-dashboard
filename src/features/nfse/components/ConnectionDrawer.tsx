import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import type { Company } from "@/features/companies/api";

import type { PagarmeAccount } from "../api";
import { AMBIENTE_OPTIONS, webhookUrl } from "../constants";
import { useCreateConnection, useRotateWebhookSecret, useUpdateConnection } from "../hooks";
import { connectionFormSchema, emptyConnectionForm, type ConnectionFormValues } from "../schema";
import { FieldToggle } from "./FieldToggle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: PagarmeAccount | null;
  companies: Company[];
}

/** Conexão "gerenciável": a do prop (edição) ou a recém-criada (estado local). */
interface ManagedAccount {
  id: string;
  slug: string;
  hasSecret: boolean;
}

export function ConnectionDrawer({ open, onOpenChange, connection, companies }: Props) {
  const create = useCreateConnection();
  const update = useUpdateConnection();
  const rotate = useRotateWebhookSecret();

  // Após criar, passamos a "gerenciar" a conexão recém-criada (sem fechar o drawer).
  const [created, setCreated] = React.useState<ManagedAccount | null>(null);
  const [revealedUrl, setRevealedUrl] = React.useState<string | null>(null);

  const managed: ManagedAccount | null = connection
    ? {
        id: connection.id,
        slug: connection.slug,
        hasSecret: Boolean(connection.webhook_secret_ref),
      }
    : created;
  const isEditing = Boolean(connection);

  const initialValues = React.useMemo<ConnectionFormValues>(() => {
    if (connection) {
      return {
        label: connection.label,
        ownerCompanyId: connection.owner_company_id,
        ambiente: connection.ambiente,
        active: connection.active,
      };
    }
    return emptyConnectionForm();
  }, [connection]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionFormSchema),
    defaultValues: initialValues,
  });

  // Reseta o estado local sempre que o drawer (re)abre ou troca de conexão.
  React.useEffect(() => {
    reset(initialValues);
    setCreated(null);
    setRevealedUrl(null);
  }, [initialValues, reset, open]);

  function revealUrl(account: ManagedAccount) {
    rotate.mutate(account.id, {
      onSuccess: (secret) => setRevealedUrl(webhookUrl(account.slug, secret)),
      onError: (err) => toast.error("Erro ao gerar segredo", { description: err.message }),
    });
  }

  const onSubmit = handleSubmit((values) => {
    const owner = companies.find((c) => c.id === values.ownerCompanyId);
    if (!owner) {
      toast.error("Empresa dona inválida");
      return;
    }
    const payload = {
      label: values.label.trim(),
      owner_company_id: values.ownerCompanyId,
      organization_id: owner.organization_id,
      ambiente: values.ambiente,
      active: values.active,
    };

    if (isEditing && connection) {
      update.mutate(
        { id: connection.id, payload },
        {
          onSuccess: () => {
            toast.success("Conexão atualizada");
            onOpenChange(false);
          },
          onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
        },
      );
      return;
    }

    create.mutate(payload, {
      onSuccess: (row) => {
        toast.success("Conexão criada");
        const account: ManagedAccount = { id: row.id, slug: row.slug, hasSecret: false };
        setCreated(account);
        revealUrl(account); // gera a 1ª URL do webhook automaticamente
      },
      onError: (err) => toast.error("Erro ao criar", { description: err.message }),
    });
  });

  const pending = create.isPending || update.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar conexão" : "Nova conexão pagar.me"}</SheetTitle>
          <SheetDescription>
            O endereço e o segredo do webhook são gerados automaticamente — você só dá um nome e
            escolhe a empresa.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="Nome" error={errors.label?.message}>
              <Input placeholder="RCO Tecnologia" {...register("label")} />
            </Field>

            <Field
              label="Empresa dona"
              error={errors.ownerCompanyId?.message}
              hint="usada quando a cobrança não tem split"
            >
              <Controller
                control={control}
                name="ownerCompanyId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.trade_name ?? c.legal_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field label="Ambiente" error={errors.ambiente?.message}>
              <Controller
                control={control}
                name="ambiente"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AMBIENTE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <FieldToggle
                  checked={field.value}
                  onChange={field.onChange}
                  label="Conexão ativa"
                  description="Webhooks de contas inativas são rejeitados."
                />
              )}
            />

            {managed && (
              <WebhookSection
                managed={managed}
                revealedUrl={revealedUrl}
                rotating={rotate.isPending}
                onGenerate={() => revealUrl(managed)}
              />
            )}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {revealedUrl ? "Concluir" : "Cancelar"}
            </Button>
            {!created && (
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {isEditing ? "Salvar" : "Criar conexão"}
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function WebhookSection({
  managed,
  revealedUrl,
  rotating,
  onGenerate,
}: {
  managed: ManagedAccount;
  revealedUrl: string | null;
  rotating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-2xs tracking-wide text-text-subtle uppercase">Webhook</Label>
        <Button type="button" size="sm" variant="outline" disabled={rotating} onClick={onGenerate}>
          {rotating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {managed.hasSecret || revealedUrl ? "Rotacionar" : "Gerar URL"}
        </Button>
      </div>

      {revealedUrl ? (
        <RevealedUrl url={revealedUrl} />
      ) : managed.hasSecret ? (
        <p className="text-2xs text-text-subtle">
          Segredo configurado. Por segurança a URL não é exibida de novo — use "Rotacionar" para
          gerar uma nova (e atualizar no pagar.me).
        </p>
      ) : (
        <p className="text-2xs text-text-subtle">
          Gere a URL do webhook para cadastrar no pagar.me.
        </p>
      )}
    </div>
  );
}

function RevealedUrl({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <code className="text-2xs flex-1 truncate rounded-[var(--radius-sm)] bg-surface px-2 py-1.5 font-mono">
          {url}
        </code>
        <Button type="button" size="icon" variant="outline" onClick={copy} aria-label="Copiar URL">
          {copied ? <Check className="size-4 text-income" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <p className="text-2xs flex items-start gap-1 text-warning">
        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
        Copie agora e cadastre no pagar.me (evento charge.paid). Por segurança, não será exibida de
        novo.
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
