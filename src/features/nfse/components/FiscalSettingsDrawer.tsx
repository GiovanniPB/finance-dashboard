import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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

import type { FiscalSettings } from "../api";
import { AMBIENTE_OPTIONS, EMISSION_MODE_OPTIONS } from "../constants";
import { useUpsertFiscalSettings } from "../hooks";
import {
  emptyFiscalSettingsForm,
  fiscalSettingsFormSchema,
  type FiscalSettingsFormValues,
} from "../schema";
import { FieldToggle } from "./FieldToggle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  settings: FiscalSettings | null;
}

export function FiscalSettingsDrawer({ open, onOpenChange, company, settings }: Props) {
  const upsert = useUpsertFiscalSettings();

  const initialValues = React.useMemo<FiscalSettingsFormValues>(() => {
    if (!company) return emptyFiscalSettingsForm("");
    if (settings) {
      return {
        companyId: company.id,
        ambiente: settings.ambiente,
        emissionMode: settings.emission_mode,
        enabled: settings.enabled,
        focusTokenRef: settings.focus_token_ref ?? "",
        inscricaoMunicipal: settings.inscricao_municipal ?? "",
        itemListaServico: settings.item_lista_servico ?? "",
        codigoTributarioMunicipio: settings.codigo_tributario_municipio ?? "",
        aliquotaIssPct: settings.aliquota_iss == null ? 0 : settings.aliquota_iss * 100,
        issRetido: settings.iss_retido,
        optanteSimples: settings.optante_simples ?? false,
      };
    }
    return emptyFiscalSettingsForm(company.id);
  }, [company, settings]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FiscalSettingsFormValues>({
    resolver: zodResolver(fiscalSettingsFormSchema),
    defaultValues: initialValues,
  });

  React.useEffect(() => reset(initialValues), [initialValues, reset]);

  const onSubmit = handleSubmit((values) => {
    const trimmed = (v: string | undefined) => (v?.trim() ? v.trim() : null);
    upsert.mutate(
      {
        company_id: values.companyId,
        ambiente: values.ambiente,
        emission_mode: values.emissionMode,
        enabled: values.enabled,
        focus_token_ref: trimmed(values.focusTokenRef),
        inscricao_municipal: trimmed(values.inscricaoMunicipal),
        item_lista_servico: trimmed(values.itemListaServico),
        codigo_tributario_municipio: trimmed(values.codigoTributarioMunicipio),
        aliquota_iss: values.aliquotaIssPct > 0 ? values.aliquotaIssPct / 100 : null,
        iss_retido: values.issRetido,
        optante_simples: values.optanteSimples,
      },
      {
        onSuccess: () => {
          toast.success("Configuração fiscal salva");
          onOpenChange(false);
        },
        onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
      },
    );
  });

  const companyName = company?.trade_name ?? company?.legal_name ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle>Configuração fiscal — {companyName}</SheetTitle>
          <SheetDescription>
            Parâmetros de emissão da NFS-e desta empresa. O token do Focus fica no Vault; aqui só a
            referência (nome).
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ambiente">
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
              <Field label="Modo de emissão">
                <Controller
                  control={control}
                  name="emissionMode"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMISSION_MODE_OPTIONS.map((o) => (
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

            <Field label="Nome do token Focus no Vault" hint="ex.: focus_token_rco">
              <Input placeholder="focus_token_rco" {...register("focusTokenRef")} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Inscrição municipal">
                <Input placeholder="5BF7555" {...register("inscricaoMunicipal")} />
              </Field>
              <Field label="Item LC116" error={errors.itemListaServico?.message}>
                <Input placeholder="17.01" {...register("itemListaServico")} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Cód. tributário municipal">
                <Input placeholder="170100" {...register("codigoTributarioMunicipio")} />
              </Field>
              <Field label="Alíquota ISS (%)" error={errors.aliquotaIssPct?.message}>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="5"
                  {...register("aliquotaIssPct", { valueAsNumber: true })}
                />
              </Field>
            </div>

            <Controller
              control={control}
              name="enabled"
              render={({ field }) => (
                <FieldToggle
                  checked={field.value}
                  onChange={field.onChange}
                  label="Emissão habilitada"
                  description="Kill-switch da empresa. Desligado, todos os jobs vão para revisão manual."
                />
              )}
            />
            <Controller
              control={control}
              name="optanteSimples"
              render={({ field }) => (
                <FieldToggle
                  checked={field.value}
                  onChange={field.onChange}
                  label="Optante do Simples Nacional"
                />
              )}
            />
            <Controller
              control={control}
              name="issRetido"
              render={({ field }) => (
                <FieldToggle checked={field.value} onChange={field.onChange} label="ISS retido" />
              )}
            />
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="size-4 animate-spin" />}
              Salvar
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
