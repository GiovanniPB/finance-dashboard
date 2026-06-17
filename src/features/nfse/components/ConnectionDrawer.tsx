import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Loader2 } from "lucide-react";
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
import { useCreateConnection, useUpdateConnection } from "../hooks";
import { connectionFormSchema, emptyConnectionForm, type ConnectionFormValues } from "../schema";
import { FieldToggle } from "./FieldToggle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: PagarmeAccount | null;
  companies: Company[];
}

export function ConnectionDrawer({ open, onOpenChange, connection, companies }: Props) {
  const isEditing = Boolean(connection);
  const create = useCreateConnection();
  const update = useUpdateConnection();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<ConnectionFormValues>(() => {
    if (connection) {
      return {
        label: connection.label,
        slug: connection.slug,
        ownerCompanyId: connection.owner_company_id,
        ambiente: connection.ambiente,
        webhookSecretRef: connection.webhook_secret_ref ?? "",
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

  React.useEffect(() => reset(initialValues), [initialValues, reset]);

  const onSubmit = handleSubmit((values) => {
    const owner = companies.find((c) => c.id === values.ownerCompanyId);
    if (!owner) {
      toast.error("Empresa dona inválida");
      return;
    }
    const trimmedSecret = values.webhookSecretRef?.trim() ?? "";
    const secretRef = trimmedSecret.length > 0 ? trimmedSecret : null;

    if (isEditing && connection) {
      update.mutate(
        {
          id: connection.id,
          payload: {
            label: values.label.trim(),
            slug: values.slug.trim(),
            owner_company_id: values.ownerCompanyId,
            organization_id: owner.organization_id,
            ambiente: values.ambiente,
            webhook_secret_ref: secretRef,
            active: values.active,
          },
        },
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

    create.mutate(
      {
        label: values.label.trim(),
        slug: values.slug.trim(),
        owner_company_id: values.ownerCompanyId,
        organization_id: owner.organization_id,
        ambiente: values.ambiente,
        webhook_secret_ref: secretRef,
        active: values.active,
      },
      {
        onSuccess: () => {
          toast.success("Conexão criada");
          onOpenChange(false);
        },
        onError: (err) => toast.error("Erro ao criar", { description: err.message }),
      },
    );
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar conexão" : "Nova conexão pagar.me"}</SheetTitle>
          <SheetDescription>
            Cada conta pagar.me é uma conexão. O webhook é endereçado pelo <code>slug</code> e
            valida o segredo próprio da conta (no Vault).
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="Nome" error={errors.label?.message}>
              <Input placeholder="RCO Tecnologia" {...register("label")} />
            </Field>

            <Field
              label="Slug (URL do webhook)"
              error={errors.slug?.message}
              hint="minúsculas, números e hífen — ex.: conta-rco"
            >
              <Input placeholder="conta-rco" {...register("slug")} />
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

            <Field
              label="Nome do segredo no Vault"
              error={errors.webhookSecretRef?.message}
              hint="referência (nome) do segredo de webhook no Vault — o valor é cadastrado fora do app"
            >
              <Input placeholder="pagarme_webhook_rco" {...register("webhookSecretRef")} />
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

            {isEditing && connection && <WebhookUrlBox slug={connection.slug} />}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar conexão"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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

function WebhookUrlBox({ slug }: { slug: string }) {
  const [copied, setCopied] = React.useState(false);
  const url = webhookUrl(slug);

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
    <div className="space-y-1.5 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
      <Label className="text-2xs tracking-wide text-text-subtle uppercase">URL do webhook</Label>
      <div className="flex items-center gap-2">
        <code className="text-2xs flex-1 truncate rounded-[var(--radius-sm)] bg-surface px-2 py-1.5 font-mono">
          {url}
        </code>
        <Button type="button" size="icon" variant="outline" onClick={copy} aria-label="Copiar URL">
          {copied ? <Check className="size-4 text-income" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <p className="text-2xs text-text-subtle">
        Cadastre esta URL no pagar.me com <strong>?secret=</strong> + o segredo da conta no Vault.
      </p>
    </div>
  );
}
