import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { BackfillCard } from "@/features/integrations/components/BackfillCard";
import { ConnectionForm } from "@/features/integrations/components/ConnectionForm";
import { ProjectionSettingsCard } from "@/features/integrations/components/ProjectionSettingsCard";
import { RecipientsSection } from "@/features/integrations/components/RecipientsSection";
import { WebhookEndpointCard } from "@/features/integrations/components/WebhookEndpointCard";
import { TestChargeDrawer } from "@/features/nfse/components/TestChargeDrawer";
import { AMBIENTE_META } from "@/features/nfse/constants";
import { useConnections } from "@/features/nfse/hooks";

/**
 * Uma conexão pagar.me, toda a configuração dela numa página.
 *
 * Ordem das seções = ordem de ativação: identificar → abrir o webhook → dizer quem
 * recebe → carregar o histórico → ligar o write-back. Quem chega aqui para ativar
 * uma conexão nova consegue descer a página de cima a baixo.
 *
 * `/integracoes/nova` renderiza a mesma página em modo criação: só a primeira
 * seção faz sentido antes da conexão existir.
 */
export default function IntegracaoDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { companies } = useCompanyScope();
  const { canEdit, canManage } = usePermissions();
  const { data: connections = [], isLoading } = useConnections();
  const [testing, setTesting] = React.useState(false);

  const isNew = slug === "nova";
  const connection = connections.find((c) => c.slug === slug) ?? null;

  if (isNew) {
    return (
      <Shell title="Nova conexão pagar.me" subtitle="Passo 1 de 5 — identificação">
        <ConnectionForm
          connection={null}
          companies={companies}
          onCreated={(created) => void navigate(`/integracoes/${created}`)}
        />
        <Card>
          <CardHeader>
            <CardTitle>Depois de criar</CardTitle>
            <CardDescription>
              Webhook, recebedores do split, carga histórica e write-back financeiro ficam
              disponíveis nesta mesma página assim que a conexão existir.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell title="Carregando…">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </Shell>
    );
  }

  if (!connection) {
    return (
      <Shell title="Conexão não encontrada">
        <Card>
          <CardContent className="py-10 text-center text-sm text-text-muted">
            Nenhuma conexão com o identificador <code>{slug}</code>.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const amb = AMBIENTE_META[connection.ambiente];
  const isSandbox = connection.ambiente !== "producao";

  return (
    <Shell
      title={connection.label}
      subtitle={connection.slug}
      badges={
        <>
          <Badge tone={amb.tone}>{amb.label}</Badge>
          <Badge tone={connection.active ? "income" : "default"}>
            {connection.active ? "Ativa" : "Inativa"}
          </Badge>
        </>
      }
      actions={
        isSandbox && canEdit ? (
          <Button variant="outline" onClick={() => setTesting(true)}>
            <FlaskConical className="size-4" /> Gerar cobrança de teste
          </Button>
        ) : null
      }
    >
      {canManage ? (
        <ConnectionForm connection={connection} companies={companies} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
            <CardDescription>
              {connection.owner?.trade_name ?? connection.owner?.legal_name ?? "—"} · {amb.label}.
              Editar exige permissão de administrador.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <WebhookEndpointCard connection={connection} />

      <RecipientsSection connection={connection} companies={companies} />

      <BackfillCard connection={connection} canEdit={canEdit} />

      <ProjectionSettingsCard connection={connection} canEdit={canEdit} />

      <TestChargeDrawer open={testing} onOpenChange={setTesting} connection={connection} />
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  badges,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div>
        <Link
          to="/integracoes"
          className="text-2xs inline-flex items-center gap-1.5 font-medium tracking-wide text-text-subtle uppercase transition-colors hover:text-text"
        >
          <ArrowLeft className="size-3.5" /> Integrações
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-1 font-mono text-xs text-text-muted">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {badges}
            {actions}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
