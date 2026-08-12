import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllCompanies } from "@/features/companies/hooks";
import { FiscalSettingsForm } from "@/features/nfse/components/FiscalSettingsForm";
import { useFiscalSettings } from "@/features/nfse/hooks";

/**
 * Configuração fiscal de uma empresa, em página própria.
 *
 * Antes era um sheet aberto de dentro de uma aba da tela de NFS-e — dois níveis de
 * navegação para chegar a um dado que é do cadastro da empresa. Agora é
 * `/companies/:id/fiscal`: endereçável, compartilhável e sem gaveta.
 */
export default function CompanyFiscalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: companies = [], isLoading } = useAllCompanies();
  const { data: settings = [], isLoading: loadingSettings } = useFiscalSettings();

  const company = companies.find((c) => c.id === id) ?? null;
  const companySettings = settings.find((s) => s.company_id === id) ?? null;

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div>
        <Link
          to="/companies?tab=fiscal"
          className="text-2xs inline-flex items-center gap-1.5 font-medium tracking-wide text-text-subtle uppercase transition-colors hover:text-text"
        >
          <ArrowLeft className="size-3.5" /> Empresas
        </Link>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          {company ? (company.trade_name ?? company.legal_name) : "Configuração fiscal"}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Como esta empresa emite documento fiscal. O gatilho da emissão vem da conexão pagar.me;
          aqui fica o que é da empresa.
        </p>
      </div>

      {isLoading || loadingSettings ? (
        <Skeleton className="h-96 w-full" />
      ) : !company ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-text-muted">
            Empresa não encontrada.
          </CardContent>
        </Card>
      ) : (
        <FiscalSettingsForm
          company={company}
          settings={companySettings}
          onSaved={() => void navigate("/companies?tab=fiscal")}
        />
      )}
    </div>
  );
}
