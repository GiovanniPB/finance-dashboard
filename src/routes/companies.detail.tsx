import { Link, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Crown, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import {
  CompanyFormFields,
  companyToFormValues,
  toCompanyPayload,
} from "@/features/companies/components/CompanyFormFields";
import { useAllCompanies, useUpdateCompany } from "@/features/companies/hooks";
import { companyFormSchema, type CompanyFormValues } from "@/features/companies/schema";
import { FiscalSettingsForm } from "@/features/nfse/components/FiscalSettingsForm";
import { useFiscalSettings } from "@/features/nfse/hooks";

/**
 * Configurações de uma empresa, em página única.
 *
 * Antes o cadastro era uma gaveta na lista e o fiscal era outra aba (e antes disso,
 * um sheet dentro do /nfse). Eram três lugares para configurar a mesma entidade.
 * Agora o card leva para cá e tudo que é "configuração desta empresa" mora junto.
 */
export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canManage } = usePermissions();
  const { data: companies = [], isLoading } = useAllCompanies();
  const { data: settings = [], isLoading: loadingSettings } = useFiscalSettings();

  const company = companies.find((c) => c.id === id) ?? null;
  const companySettings = settings.find((s) => s.company_id === id) ?? null;

  if (isLoading || loadingSettings) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
        <BackLink />
        <Card>
          <CardContent className="py-10 text-center text-sm text-text-muted">
            Empresa não encontrada.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div>
        <BackLink />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {company.trade_name ?? company.legal_name}
          </h1>
          {company.is_holding && (
            <Badge tone="accent">
              <Crown className="size-3" /> Holding
            </Badge>
          )}
          {!company.is_active && <Badge tone="default">Inativa</Badge>}
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Cadastro e configuração fiscal desta empresa.
        </p>
      </div>

      {!canManage && (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted">
          Você tem acesso somente leitura a estas configurações.
        </div>
      )}

      <CadastroCard company={company} canManage={canManage} />

      {/*
        A configuração fiscal é dado da EMPRESA (inscrição municipal, item da
        LC116, alíquota de ISS, regime) — não da integração. Da conexão pagar.me
        vem só o gatilho da emissão.
      */}
      <FiscalSettingsForm company={company} settings={companySettings} />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/companies"
      className="text-2xs inline-flex items-center gap-1.5 font-medium tracking-wide text-text-subtle uppercase transition-colors hover:text-text"
    >
      <ArrowLeft className="size-3.5" /> Empresas
    </Link>
  );
}

interface CadastroCardProps {
  company: Parameters<typeof companyToFormValues>[0] & { id: string };
  canManage: boolean;
}

function CadastroCard({ company, canManage }: CadastroCardProps) {
  const update = useUpdateCompany();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: companyToFormValues(company),
  });

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      { id: company.id, payload: toCompanyPayload(values) },
      {
        onSuccess: () => {
          toast.success("Empresa atualizada");
          // sem isto o formulário continua "sujo" e o botão salvar segue ativo
          reset(values);
        },
        onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
      },
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cadastro</CardTitle>
        <CardDescription>
          Identificação e regime da empresa. Cada empresa tem seu próprio plano de contas e
          lançamentos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <CompanyFormFields
            register={register}
            control={control}
            errors={errors}
            disabled={!canManage}
          />
          {canManage && (
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="submit" disabled={update.isPending || !isDirty}>
                {update.isPending && <Loader2 className="size-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
