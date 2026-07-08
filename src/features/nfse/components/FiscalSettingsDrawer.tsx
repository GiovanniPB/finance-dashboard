import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2 } from "lucide-react";
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
import type { Company } from "@/features/companies/api";
import type { Tables } from "@/lib/supabase";

import type { FiscalSettings } from "../api";
import {
  AMBIENTE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  EMISSION_MODE_OPTIONS,
  REGIME_TRIBUTARIO_OPTIONS,
} from "../constants";
import { useSetFocusToken, useUpsertFiscalSettings } from "../hooks";
import {
  emptyFiscalSettingsForm,
  fiscalSettingsFormSchema,
  type FiscalSettingsFormValues,
} from "../schema";
import { FieldToggle } from "./FieldToggle";

type FiscalParametros = Tables["fiscal_company_settings"]["Insert"]["parametros"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  settings: FiscalSettings | null;
}

const trimmed = (v: string | undefined): string | null => (v?.trim() ? v.trim() : null);
const intOrNull = (v: string | undefined): number | null => {
  const t = v?.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Lê os defaults de NF-e que ficam no overflow `parametros.nfe`. */
function readNfeDefaults(settings: FiscalSettings | null): Record<string, unknown> {
  const p = (settings?.parametros ?? {}) as Record<string, unknown>;
  return (p.nfe as Record<string, unknown> | undefined) ?? {};
}

function readEmitente(settings: FiscalSettings | null): Record<string, unknown> {
  return (settings?.emitente_endereco as Record<string, unknown> | null) ?? {};
}

export function FiscalSettingsDrawer({ open, onOpenChange, company, settings }: Props) {
  const upsert = useUpsertFiscalSettings();
  const saveToken = useSetFocusToken();
  const [token, setTokenValue] = React.useState("");

  const initialValues = React.useMemo<FiscalSettingsFormValues>(() => {
    if (!company) return emptyFiscalSettingsForm("");
    if (!settings) return emptyFiscalSettingsForm(company.id);
    const nfe = readNfeDefaults(settings);
    const emit = readEmitente(settings);
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const num = (v: unknown) => (typeof v === "number" ? v : 0);
    return {
      companyId: company.id,
      documentType: settings.document_type ?? "nfse",
      ambiente: settings.ambiente,
      emissionMode: settings.emission_mode,
      enabled: settings.enabled,
      inscricaoMunicipal: settings.inscricao_municipal ?? "",
      itemListaServico: settings.item_lista_servico ?? "",
      codigoTributarioMunicipio: settings.codigo_tributario_municipio ?? "",
      aliquotaIssPct: settings.aliquota_iss == null ? 0 : settings.aliquota_iss * 100,
      issRetido: settings.iss_retido,
      optanteSimples: settings.optante_simples ?? false,
      discriminacao: settings.discriminacao ?? "",
      codigoOpcaoSimplesNacional:
        settings.codigo_opcao_simples_nacional == null
          ? ""
          : String(settings.codigo_opcao_simples_nacional),
      regimeTributarioSimplesNacional:
        settings.regime_tributario_simples_nacional == null
          ? ""
          : String(settings.regime_tributario_simples_nacional),
      inscricaoEstadual: settings.inscricao_estadual ?? "",
      regimeTributario: settings.regime_tributario ?? 3,
      serie: settings.serie ?? "",
      emitenteLogradouro: str(emit.logradouro),
      emitenteNumero: str(emit.numero),
      emitenteComplemento: str(emit.complemento),
      emitenteBairro: str(emit.bairro),
      emitenteMunicipio: str(emit.municipio),
      emitenteUf: str(emit.uf),
      emitenteCep: str(emit.cep),
      codigoProduto: str(nfe.codigoProduto),
      produtoDescricao: str(nfe.descricao),
      ncm: str(nfe.ncm),
      cest: str(nfe.cest),
      cfopInterno: str(nfe.cfopInterno),
      cfopInterestadual: str(nfe.cfopInterestadual),
      cstIcms: str(nfe.cstIcms),
      codigoBeneficioFiscal: str(nfe.codigoBeneficioFiscal),
      pisAliquotaPct: num(nfe.pisAliquota),
      cofinsAliquotaPct: num(nfe.cofinsAliquota),
      infoComplementar: str(nfe.infoComplementar),
    };
  }, [company, settings]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FiscalSettingsFormValues>({
    resolver: zodResolver(fiscalSettingsFormSchema),
    defaultValues: initialValues,
  });

  React.useEffect(() => {
    reset(initialValues);
    setTokenValue("");
  }, [initialValues, reset]);

  const documentType = watch("documentType");
  const isNfe = documentType === "nfe";

  const onSubmit = handleSubmit((values) => {
    const existingParametros = (settings?.parametros ?? {}) as Record<string, unknown>;
    const nfeParametros = {
      codigoProduto: trimmed(values.codigoProduto),
      descricao: trimmed(values.produtoDescricao),
      ncm: trimmed(values.ncm),
      cest: trimmed(values.cest),
      cfopInterno: trimmed(values.cfopInterno),
      cfopInterestadual: trimmed(values.cfopInterestadual),
      origem: 0,
      cstIcms: trimmed(values.cstIcms),
      codigoBeneficioFiscal: trimmed(values.codigoBeneficioFiscal),
      pisCst: "01",
      pisAliquota: values.pisAliquotaPct > 0 ? values.pisAliquotaPct : null,
      cofinsCst: "01",
      cofinsAliquota: values.cofinsAliquotaPct > 0 ? values.cofinsAliquotaPct : null,
      infoComplementar: trimmed(values.infoComplementar),
    };

    const emitenteEndereco = isNfe
      ? {
          logradouro: trimmed(values.emitenteLogradouro),
          numero: trimmed(values.emitenteNumero),
          complemento: trimmed(values.emitenteComplemento),
          bairro: trimmed(values.emitenteBairro),
          municipio: trimmed(values.emitenteMunicipio),
          uf: trimmed(values.emitenteUf),
          cep: trimmed(values.emitenteCep),
        }
      : (settings?.emitente_endereco ?? null);

    upsert.mutate(
      {
        company_id: values.companyId,
        document_type: values.documentType,
        ambiente: values.ambiente,
        emission_mode: values.emissionMode,
        enabled: values.enabled,
        inscricao_municipal: trimmed(values.inscricaoMunicipal),
        item_lista_servico: trimmed(values.itemListaServico),
        codigo_tributario_municipio: trimmed(values.codigoTributarioMunicipio),
        aliquota_iss: values.aliquotaIssPct > 0 ? values.aliquotaIssPct / 100 : null,
        iss_retido: values.issRetido,
        optante_simples: values.optanteSimples,
        discriminacao: trimmed(values.discriminacao),
        codigo_opcao_simples_nacional: intOrNull(values.codigoOpcaoSimplesNacional),
        regime_tributario_simples_nacional: intOrNull(values.regimeTributarioSimplesNacional),
        inscricao_estadual: trimmed(values.inscricaoEstadual),
        regime_tributario: values.regimeTributario,
        serie: trimmed(values.serie),
        emitente_endereco: emitenteEndereco,
        parametros: (isNfe
          ? { ...existingParametros, nfe: nfeParametros }
          : existingParametros) as FiscalParametros,
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

  const onSaveToken = () => {
    if (!company) return;
    saveToken.mutate(
      { companyId: company.id, token },
      {
        onSuccess: () => {
          toast.success("Token do Focus salvo");
          setTokenValue("");
        },
        onError: (err) => toast.error("Erro ao salvar token", { description: err.message }),
      },
    );
  };

  const companyName = company?.trade_name ?? company?.legal_name ?? "";
  const tokenConfigured = Boolean(settings?.focus_token_ref);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle>Configuração fiscal — {companyName}</SheetTitle>
          <SheetDescription>
            Tipo de documento, emitente e classificação fiscal desta empresa. O token do Focus é
            guardado com segurança (Vault).
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de documento">
                <Controller
                  control={control}
                  name="documentType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
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
            </div>

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

            <div className="space-y-1.5 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <Label>Token do Focus NFe</Label>
                {tokenConfigured ? (
                  <Badge tone="income">configurado</Badge>
                ) : (
                  <Badge tone="warning">pendente</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={tokenConfigured ? "•••••••• (rotacionar)" : "cole o token do Focus"}
                  value={token}
                  onChange={(e) => setTokenValue(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={saveToken.isPending || token.trim().length === 0}
                  onClick={onSaveToken}
                >
                  {saveToken.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Salvar
                </Button>
              </div>
              <p className="text-2xs text-text-subtle">
                Guardado com segurança no Vault. Para trocar, cole um novo e salve.
              </p>
            </div>

            {isNfe ? (
              <NfeFields control={control} register={register} errors={errors} />
            ) : (
              <NfseFields control={control} register={register} errors={errors} />
            )}

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

type UseFormReturn = ReturnType<typeof useForm<FiscalSettingsFormValues>>;
type Register = UseFormReturn["register"];
type Errors = UseFormReturn["formState"]["errors"];
type Control = UseFormReturn["control"];

/** Bloco NFS-e (serviço): IM, LC116, ISS, Simples (Barueri), discriminação. */
function NfseFields({
  control,
  register,
  errors,
}: {
  control: Control;
  register: Register;
  errors: Errors;
}) {
  return (
    <SectionCard title="NFS-e — serviço">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inscrição municipal">
          <Input placeholder="5BF7555" {...register("inscricaoMunicipal")} />
        </Field>
        <Field label="Item LC116" error={errors.itemListaServico?.message}>
          <Input placeholder="080201220" {...register("itemListaServico")} />
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
            placeholder="2"
            {...register("aliquotaIssPct", { valueAsNumber: true })}
          />
        </Field>
      </div>
      <Field label="Discriminação">
        <Input placeholder="Research RCO" {...register("discriminacao")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cód. opção Simples" hint="Barueri: 3 = ME/EPP">
          <Input placeholder="3" {...register("codigoOpcaoSimplesNacional")} />
        </Field>
        <Field label="Regime trib. Simples" hint="Barueri: 1">
          <Input placeholder="1" {...register("regimeTributarioSimplesNacional")} />
        </Field>
      </div>
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
    </SectionCard>
  );
}

/** Bloco NF-e (produto): emitente + classificação do produto. */
function NfeFields({
  control,
  register,
  errors,
}: {
  control: Control;
  register: Register;
  errors: Errors;
}) {
  return (
    <>
      <SectionCard title="NF-e — emitente">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inscrição estadual">
            <Input placeholder="206764802112" {...register("inscricaoEstadual")} />
          </Field>
          <Field label="Regime tributário">
            <Controller
              control={control}
              name="regimeTributario"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIME_TRIBUTARIO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <Field label="Série" hint="série própria p/ não colidir com emissor legado">
          <Input placeholder="101" {...register("serie")} />
        </Field>
        <Field label="Endereço (logradouro)">
          <Input placeholder="Alameda Rio Negro" {...register("emitenteLogradouro")} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Número">
            <Input placeholder="500" {...register("emitenteNumero")} />
          </Field>
          <Field label="Bairro">
            <Input placeholder="Alphaville" {...register("emitenteBairro")} />
          </Field>
          <Field label="CEP">
            <Input placeholder="06454000" {...register("emitenteCep")} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <Field label="Município">
            <Input placeholder="Barueri" {...register("emitenteMunicipio")} />
          </Field>
          <Field label="UF">
            <Input placeholder="SP" {...register("emitenteUf")} />
          </Field>
        </div>
        <Field label="Complemento">
          <Input placeholder="Torre B Sala 501" {...register("emitenteComplemento")} />
        </Field>
      </SectionCard>

      <SectionCard title="NF-e — produto / tributação">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código do produto">
            <Input placeholder="899" {...register("codigoProduto")} />
          </Field>
          <Field label="Descrição">
            <Input placeholder="Curso e Plataforma" {...register("produtoDescricao")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="NCM">
            <Input placeholder="49019900" {...register("ncm")} />
          </Field>
          <Field label="CEST">
            <Input placeholder="2806400" {...register("cest")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CFOP interno (dentro da UF)">
            <Input placeholder="5101" {...register("cfopInterno")} />
          </Field>
          <Field label="CFOP interestadual">
            <Input placeholder="6107" {...register("cfopInterestadual")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CST ICMS" hint="41 = imunidade (livro)">
            <Input placeholder="41" {...register("cstIcms")} />
          </Field>
          <Field label="cBenef (SP)" hint="exigido p/ CST 41 em SP">
            <Input placeholder="SP070130" {...register("codigoBeneficioFiscal")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="PIS (%)"
            error={errors.pisAliquotaPct?.message}
            hint="tributado — não zerar"
          >
            <Input
              type="number"
              step="0.01"
              placeholder="0.65"
              {...register("pisAliquotaPct", { valueAsNumber: true })}
            />
          </Field>
          <Field label="COFINS (%)" error={errors.cofinsAliquotaPct?.message}>
            <Input
              type="number"
              step="0.01"
              placeholder="3"
              {...register("cofinsAliquotaPct", { valueAsNumber: true })}
            />
          </Field>
        </div>
        <Field label="Informações complementares" hint="fundamentação da imunidade">
          <Input placeholder="PRODUTO COM IMUNIDADE..." {...register("infoComplementar")} />
        </Field>
      </SectionCard>
    </>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">{title}</div>
      {children}
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
