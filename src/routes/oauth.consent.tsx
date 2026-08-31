import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Bot, Building2, Check, Loader2, Lock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePermissions } from "@/features/auth/usePermissions";
import { useCompanies } from "@/features/companies/hooks";
import { resumirAcesso } from "@/features/mcp/consent";
import { supabase } from "@/lib/supabase";

/**
 * Tela de consentimento do OAuth 2.1 Server.
 *
 * O Supabase manda o usuário para cá com `authorization_id` na query; nós mostramos
 * quem está pedindo e o que o acesso concede, e devolvemos a decisão. A emissão do
 * token continua sendo do Supabase — esta página não vê nem toca em segredo nenhum.
 *
 * O `scope` que chega ("openid email profile") não descreve dado financeiro, então
 * exibi-lo cru seria consentimento de fachada. O que a tela mostra é o escopo real:
 * as empresas e módulos do próprio usuário, e o fato de ser somente leitura.
 */

interface DetalhesAutorizacao {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri?: string; logo_uri?: string };
  user: { id: string; email: string };
  scope: string;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; detalhes: DetalhesAutorizacao }
  | { fase: "decidindo"; detalhes: DetalhesAutorizacao }
  | { fase: "erro"; mensagem: string };

function temRedirect(valor: unknown): valor is { redirect_url: string } {
  return typeof valor === "object" && valor !== null && "redirect_url" in valor;
}

export default function OauthConsentPage() {
  const [searchParams] = useSearchParams();
  const authorizationId = searchParams.get("authorization_id");
  const [estado, setEstado] = React.useState<Estado>({ fase: "carregando" });

  const { data: companies } = useCompanies();
  const { isSuperAdmin, visibleModules } = usePermissions();

  React.useEffect(() => {
    if (!authorizationId) {
      setEstado({
        fase: "erro",
        mensagem:
          "Falta o parâmetro authorization_id. Esta página só é acessada a partir de um pedido de autorização.",
      });
      return;
    }

    let ativo = true;
    void (async () => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!ativo) return;
      if (error) {
        setEstado({ fase: "erro", mensagem: error.message });
        return;
      }
      // Já consentido antes: o Supabase devolve direto a URL de retorno.
      if (temRedirect(data)) {
        window.location.assign(data.redirect_url);
        return;
      }
      setEstado({ fase: "pronto", detalhes: data as unknown as DetalhesAutorizacao });
    })();

    return () => {
      ativo = false;
    };
  }, [authorizationId]);

  async function decidir(aprovar: boolean) {
    if (estado.fase !== "pronto") return;
    const { detalhes } = estado;
    setEstado({ fase: "decidindo", detalhes });

    const acao = aprovar
      ? supabase.auth.oauth.approveAuthorization(detalhes.authorization_id, {
          skipBrowserRedirect: true,
        })
      : supabase.auth.oauth.denyAuthorization(detalhes.authorization_id, {
          skipBrowserRedirect: true,
        });

    const { data, error } = await acao;
    if (error) {
      setEstado({ fase: "erro", mensagem: error.message });
      return;
    }
    if (temRedirect(data)) {
      window.location.assign(data.redirect_url);
      return;
    }
    setEstado({
      fase: "erro",
      mensagem: "O servidor não devolveu para onde retornar. Recomece a conexão pelo aplicativo.",
    });
  }

  if (estado.fase === "erro") {
    return (
      <Moldura>
        <div className="flex items-start gap-3 text-expense">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Não foi possível continuar</p>
            <p className="mt-1 text-sm text-text-muted">{estado.mensagem}</p>
          </div>
        </div>
      </Moldura>
    );
  }

  if (estado.fase === "carregando") {
    return (
      <Moldura>
        <div className="flex items-center gap-3 text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Verificando o pedido de autorização…</span>
        </div>
      </Moldura>
    );
  }

  const { detalhes } = estado;
  const decidindo = estado.fase === "decidindo";
  const acesso = resumirAcesso({
    empresas: (companies ?? []).map((c) => ({
      id: c.id,
      nome: c.trade_name ?? c.legal_name,
    })),
    isSuperAdmin,
    visibleModules,
  });

  return (
    <Moldura>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent-soft p-2">
          <Bot className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text">
            {detalhes.client.name} quer acessar seus dados
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Conectando como <span className="font-medium text-text">{detalhes.user.email}</span>
          </p>
        </div>
      </div>

      <p className="mt-5 text-sm text-text">{acesso.resumo}</p>

      <div className="mt-5 space-y-4 rounded-lg border border-border bg-surface-2 p-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-text-muted uppercase">
            <Building2 className="h-3.5 w-3.5" /> Empresas
          </p>
          <p className="mt-1.5 text-sm text-text">
            {acesso.empresas.length > 0
              ? acesso.empresas.map((e) => e.nome).join(" · ")
              : "Nenhuma empresa atribuída ao seu usuário."}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-text-muted uppercase">Módulos</p>
          <p className="mt-1.5 text-sm text-text">
            {acesso.modulos.length > 0
              ? acesso.modulos.map((m) => m.label).join(" · ")
              : "Nenhum módulo liberado."}
          </p>
        </div>
        <div className="flex items-start gap-2 border-t border-border pt-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-income" />
          <p className="text-sm text-text-muted">
            <span className="font-medium text-text">Somente leitura.</span> O banco recusa qualquer
            escrita vinda de um acesso como este, mesmo que o aplicativo tente.
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Você pode revogar este acesso quando quiser, no seu perfil. Retornará para{" "}
        <span className="font-mono">{detalhes.redirect_uri}</span>.
      </p>

      <div className="mt-6 flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          disabled={decidindo}
          onClick={() => void decidir(false)}
        >
          <X className="mr-2 h-4 w-4" /> Recusar
        </Button>
        <Button className="flex-1" disabled={decidindo} onClick={() => void decidir(true)}>
          {decidindo ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          Autorizar leitura
        </Button>
      </div>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <Card className="w-full max-w-lg">
        <CardContent className="p-6">{children}</CardContent>
      </Card>
    </div>
  );
}
