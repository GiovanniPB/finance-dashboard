import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MapPinned, Save, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/AuthProvider";

import type { InvoiceJob } from "../api";
import { lookupCep } from "../cep";
import { useSaveTomadorReview } from "../hooks";
import { tomadorReviewFormSchema, type TomadorReviewFormValues } from "../schema";
import { deriveTomadorEndereco, ENDERECO_FIELD_LABELS, type TomadorEndereco } from "../tomador";

interface Props {
  job: InvoiceJob;
  onCancel: () => void;
  /** Chamado após salvar. `requeued` diz se a nota voltou para a fila. */
  onSaved: (requeued: boolean) => void;
}

/** Preenche o formulário com o que a esteira derivaria hoje — inclusive as correções já salvas. */
function initialValues(job: InvoiceJob): TomadorReviewFormValues {
  const { endereco } = deriveTomadorEndereco(job.tomador_endereco);
  const str = (v: string | null) => v ?? "";

  return {
    documento: str(job.tomador_documento),
    nome: str(job.tomador_nome),
    email: str(job.tomador_email),
    logradouro: str(endereco.logradouro),
    numero: str(endereco.numero),
    complemento: str(endereco.complemento),
    bairro: str(endereco.bairro),
    cep: str(endereco.cep),
    municipio: str(endereco.municipio),
    uf: str(endereco.uf),
    codigoMunicipio: str(endereco.codigoMunicipio),
  };
}

/**
 * Revisão manual do tomador de uma nota que não pôde ser emitida.
 *
 * Existe porque o pagar.me nem sempre entrega o que a prefeitura exige (bairro,
 * código IBGE do município, CPF/CNPJ) — e sem uma forma de completar esses campos
 * a nota só sabia repetir a mesma rejeição. O que for digitado aqui tem
 * precedência sobre a derivação automática na hora de emitir.
 */
export function TomadorReviewForm({ job, onCancel, onSaved }: Props) {
  const { user } = useAuth();
  const save = useSaveTomadorReview();
  const [cepLoading, setCepLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<TomadorReviewFormValues>({
    resolver: zodResolver(tomadorReviewFormSchema),
    defaultValues: initialValues(job),
  });

  // o que ainda falta, recalculado a cada tecla — o operador vê o alerta sumir
  const current = watch();
  const stillMissing = React.useMemo(() => {
    const filled = (v: string | undefined) => (v ?? "").trim().length > 0;
    const fields: (keyof TomadorEndereco)[] = [
      "logradouro",
      "numero",
      "bairro",
      "cep",
      "municipio",
      "uf",
      "codigoMunicipio",
    ];
    const missing = fields.filter((f) => !filled(current[f])).map((f) => ENDERECO_FIELD_LABELS[f]);
    if (!filled(current.documento)) missing.unshift("CPF/CNPJ");
    return missing;
  }, [current]);

  async function fillFromCep() {
    const cep = getValues("cep") ?? "";
    setCepLoading(true);
    const result = await lookupCep(cep);
    setCepLoading(false);

    if (result.status === "invalid") {
      toast.error("Informe um CEP com 8 dígitos");
      return;
    }
    if (result.status === "not_found") {
      toast.error("CEP não encontrado no ViaCEP", {
        description: "Confira o número ou preencha os campos à mão.",
      });
      return;
    }
    if (result.status === "error") {
      toast.error("Não foi possível consultar o CEP", { description: result.message });
      return;
    }

    // não sobrescreve o que o operador já digitou — só completa o que está vazio
    const fill = (field: keyof TomadorReviewFormValues, value: string | null) => {
      if (value && !(getValues(field) ?? "").trim()) {
        setValue(field, value, { shouldValidate: true, shouldDirty: true });
      }
    };
    fill("logradouro", result.data.logradouro);
    fill("bairro", result.data.bairro);
    fill("municipio", result.data.municipio);
    fill("uf", result.data.uf);
    fill("codigoMunicipio", result.data.ibge);

    toast.success("Endereço preenchido pelo CEP");
  }

  function submit(values: TomadorReviewFormValues, requeue: boolean) {
    save.mutate(
      { id: job.id, userId: user?.id ?? "", values, requeue },
      {
        onSuccess: () => onSaved(requeue),
        onError: (err) =>
          toast.error("Erro ao salvar a revisão", {
            description: err instanceof Error ? err.message : undefined,
          }),
      },
    );
  }

  const canEmit = stillMissing.length === 0;

  return (
    <form className="space-y-4" onSubmit={handleSubmit((v) => submit(v, false))}>
      {stillMissing.length > 0 && (
        <p className="text-2xs rounded-[var(--radius-sm)] bg-warning-soft p-2 text-warning">
          Ainda falta para emitir: <strong>{stillMissing.join(", ")}</strong>
        </p>
      )}

      <div className="space-y-1.5">
        <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
          Identificação
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPF / CNPJ" error={errors.documento?.message}>
            <Input placeholder="000.000.000-00" {...register("documento")} />
          </Field>
          <Field label="Nome / Razão social" error={errors.nome?.message}>
            <Input {...register("nome")} />
          </Field>
        </div>
        <Field label="E-mail" error={errors.email?.message}>
          <Input type="email" {...register("email")} />
        </Field>
      </div>

      <div className="space-y-1.5">
        <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
          Endereço
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="CEP" error={errors.cep?.message} hint="Preenche o resto pelo ViaCEP">
            <Input placeholder="06401-000" {...register("cep")} />
          </Field>
          <Button
            type="button"
            variant="secondary"
            disabled={cepLoading}
            onClick={() => void fillFromCep()}
          >
            {cepLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MapPinned className="size-4" />
            )}
            Buscar
          </Button>
        </div>

        <Field label="Logradouro" error={errors.logradouro?.message}>
          <Input placeholder="Rua Exemplo" {...register("logradouro")} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Número" error={errors.numero?.message}>
            <Input placeholder="100" {...register("numero")} />
          </Field>
          <Field label="Complemento" error={errors.complemento?.message}>
            <Input placeholder="Sala 5" {...register("complemento")} />
          </Field>
        </div>

        <Field label="Bairro" error={errors.bairro?.message}>
          <Input placeholder="Centro" {...register("bairro")} />
        </Field>

        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <Field label="Município" error={errors.municipio?.message}>
            <Input placeholder="Barueri" {...register("municipio")} />
          </Field>
          <Field label="UF" error={errors.uf?.message}>
            <Input placeholder="SP" maxLength={2} {...register("uf")} />
          </Field>
        </div>

        <Field
          label="Código IBGE do município"
          error={errors.codigoMunicipio?.message}
          hint="Obrigatório na NFS-e — vem do ViaCEP pelo CEP"
        >
          <Input placeholder="3505708" {...register("codigoMunicipio")} />
        </Field>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" variant="secondary" disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Salvar
        </Button>
        <Button
          type="button"
          disabled={save.isPending || !canEmit}
          title={canEmit ? undefined : `Faltando: ${stillMissing.join(", ")}`}
          onClick={() => void handleSubmit((v) => submit(v, true))()}
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Salvar e reemitir
        </Button>
      </div>
    </form>
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
