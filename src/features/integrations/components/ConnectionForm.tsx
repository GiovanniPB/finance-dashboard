import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Company } from "@/features/companies/api";
import type { PagarmeAccount } from "@/features/nfse/api";
import { FieldToggle } from "@/features/nfse/components/FieldToggle";
import { AMBIENTE_OPTIONS } from "@/features/nfse/constants";
import {
  useCreateConnection,
  useSetPagarmeAccountSecret,
  useUpdateConnection,
} from "@/features/nfse/hooks";
import {
  connectionFormSchema,
  emptyConnectionForm,
  type ConnectionFormValues,
} from "@/features/nfse/schema";

interface Props {
  /** null = criação. */
  connection: PagarmeAccount | null;
  companies: Company[];
  /** Chamado com o slug após criar, para a página levar ao detalhe. */
  onCreated?: (slug: string) => void;
}

/**
 * Identificação e credenciais de uma conexão pagar.me.
 *
 * Antes vivia num sheet junto de recebedores, webhook e teste — o que obrigava a
 * abrir e fechar gaveta para ver o estado de uma coisa só. Aqui é seção de página:
 * o formulário fica visível ao lado do resto da configuração da mesma conexão.
 */
export function ConnectionForm({ connection, companies, onCreated }: Props) {
  const create = useCreateConnection();
  const update = useUpdateConnection();
  const saveApiSecret = useSetPagarmeAccountSecret();
  const [apiKey, setApiKey] = React.useState("");

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

  React.useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

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
          onSuccess: () => toast.success("Conexão atualizada"),
          onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
        },
      );
      return;
    }

    create.mutate(payload, {
      onSuccess: (row) => {
        toast.success("Conexão criada. Gere a URL do webhook para ativá-la.");
        onCreated?.(row.slug);
      },
      onError: (err) => toast.error("Erro ao criar", { description: err.message }),
    });
  });

  const pending = create.isPending || update.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identificação</CardTitle>
        <CardDescription>
          {isEditing
            ? "Nome, empresa dona e ambiente desta conexão."
            : "Dê um nome e escolha a empresa. O endereço e o segredo do webhook são gerados depois."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

            <Field
              label="Ambiente"
              error={errors.ambiente?.message}
              hint="homologação não alimenta o financeiro"
            >
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
          </div>

          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <FieldToggle
                checked={field.value}
                onChange={field.onChange}
                label="Conexão ativa"
                description="Webhooks de conexões inativas são rejeitados."
              />
            )}
          />

          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isEditing ? "Salvar" : "Criar conexão"}
          </Button>
        </form>

        {connection ? (
          <div className="space-y-1.5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label>Secret key da API (pagar.me)</Label>
              {connection.api_secret_ref ? (
                <span className="text-2xs text-income">configurada</span>
              ) : (
                <span className="text-2xs text-warning">pendente</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                placeholder="sk_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={saveApiSecret.isPending || apiKey.trim().length === 0}
                onClick={() =>
                  saveApiSecret.mutate(
                    { accountId: connection.id, secret: apiKey.trim() },
                    {
                      onSuccess: () => {
                        toast.success("Secret key salva");
                        setApiKey("");
                      },
                      onError: (err) =>
                        toast.error("Erro ao salvar key", { description: err.message }),
                    },
                  )
                }
              >
                {saveApiSecret.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Salvar
              </Button>
            </div>
            <p className="text-2xs text-text-subtle">
              Sem ela não há sincronização de vendas nem validação de split pelos payables. Guardada
              no Vault — não é exibida depois.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
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
