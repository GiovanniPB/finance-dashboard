/**
 * Decisão sobre o conector que está chamando.
 *
 * HISTÓRICO, porque a inversão importa. A primeira versão era uma lista de
 * PERMITIDOS: só o `client_id` cadastrado em `mcp_clients` podia usar o servidor.
 * A ideia era "além do que o usuário aprova, a casa também autoriza".
 *
 * Não funciona contra registro dinâmico. Com DCR, **cada tentativa de conexão
 * registra um client_id novo** — o Claude criou quatro em cinco minutos. Autorizar um
 * id significa autorizar algo que já morreu; a lista nunca fica satisfeita e o
 * conector nunca conecta.
 *
 * E a proteção que ela dava era menor do que parecia: registrar um cliente, sozinho,
 * não dá acesso a nada. Quem quer um token ainda precisa das credenciais da pessoa e
 * do consentimento explícito dela. As defesas reais continuam sendo outras três: o
 * consentimento, a RLS (cada um vê só o que já veria na tela) e a blindagem de
 * escrita no banco.
 *
 * O que valia a pena preservar era a capacidade de **revogar** um conector na hora.
 * Isso uma lista de bloqueio faz igual, sem brigar com o protocolo: por padrão passa,
 * e só é barrado quem foi explicitamente desativado. Quem está em uso de fato aparece
 * em `mcp_query_log.client_id`.
 */

/** Linha de `mcp_clients`, ou null quando o conector nunca foi cadastrado. */
export interface RegistroDeConector {
  nome: string;
  ativo: boolean;
}

/**
 * Devolve o motivo da recusa, ou null para deixar passar.
 *
 * `registro` null = conector desconhecido, e isso é o caso NORMAL com registro
 * dinâmico. Passa.
 */
export function decidirSobreConector(
  clientId: string | undefined,
  registro: RegistroDeConector | null,
): string | null {
  if (!clientId) {
    return "Token sem client_id: este endpoint só atende conectores OAuth.";
  }
  if (registro && !registro.ativo) {
    return `O conector "${registro.nome}" foi desativado neste servidor. Fale com o administrador.`;
  }
  return null;
}
