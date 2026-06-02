# Plano de implementação — NFS-e (Focus × pagar.me)

> Ver [arquitetura](./nfse-pagarme-architecture.md) e [rascunho SQL](./sql/nfse-schema-draft.sql).
> Princípio: validar em **camadas**, do menor risco/custo (interno) ao maior (terceiros), terminando em homologação ponta-a-ponta. Só então produção.

## Estratégia de validação (4 camadas)

| Camada                    | O que valida                                                                          | Depende de terceiro?    |
| ------------------------- | ------------------------------------------------------------------------------------- | ----------------------- |
| **0 — Pipeline interno**  | Explosão de split, idempotência, máquina de estados                                   | Não (fixtures)          |
| **1 — pagar.me sandbox**  | Assinatura do webhook, payload real de split, mapeamento recipient→empresa            | pagar.me (chaves teste) |
| **2 — Focus homologação** | Aceite do payload Barueri, fluxo assíncrono, webhook Focus, storage XML/PDF, rejeição | Focus (token homolog.)  |
| **3 — E2E homologação**   | Esteira inteira junta (ensaio geral)                                                  | Ambos                   |

---

## Fase 0 — Fundação de dados e segredos

**Objetivo:** schema + segredos prontos, sem nenhuma chamada externa.

- [x] Migration das 6 tabelas (`fiscal_company_settings`, `pagarme_recipient_map`, `service_catalog`, `sales_events`, `invoice_jobs`, `focus_events`) + enums — `supabase/migrations/20260602144027_nfse_schema.sql`, validada com `db reset` local. _(falta `db push` ao remoto após PR)_
- [x] Fila **baseada em status** na `invoice_jobs` (`status='queued'` + `FOR UPDATE SKIP LOCKED`) — decisão KISS, sem pgmq.
- [x] RLS policies + triggers `updated_at` + `audit_log` nas tabelas novas.
- [x] `gen types` → `src/types/database.ts` atualizado.
- [ ] Vault: cadastrar `secret_key` pagar.me (teste) e estrutura para tokens Focus por empresa.

**Saída:** banco pronto, tipado no frontend.

---

## Fase 1 — Camada 0: pipeline interno (sem terceiros)

**Objetivo:** provar a lógica de split + idempotência + estados com fixtures.

- [ ] Edge Function `pagarme-webhook`: parse, gravação idempotente em `sales_events`.
- [ ] Lógica de **explosão de split** → N `invoice_jobs` (com `service_catalog` + `recipient_map`).
- [ ] Invariante de soma das fatias (teste).
- [ ] Gate `manual` vs `automatic` (flag `emission_mode`).
- [ ] Testes de integração (Vitest/Deno) com **fixtures** de `charge.paid` com split.
- [ ] Geração de `focus_ref` alfanumérico sem hífen.

**Critério de pronto:** reprocessar o mesmo evento não duplica; valores das fatias batem; estados transicionam corretamente. **Tudo verde sem rede.**

---

## Fase 2 — Camada 1: pagar.me sandbox

**Objetivo:** validar contra o pagar.me real (chaves de teste).

- [ ] Criar cliente + plano + **assinatura de teste com split** entre 2 recebedores de teste.
- [ ] Configurar webhook pagar.me → URL pública da Edge Function (preview deploy).
- [ ] Verificação de origem/segredo do webhook.
- [ ] Disparar cobrança e confirmar criação correta dos jobs (payload real, não fixture).
- [ ] Popular `pagarme_recipient_map` (recebedores teste → empresas).

**Critério de pronto:** webhook real do pagar.me gera os jobs certos, com origem verificada.

---

## Fase 3 — Camada 2: Focus homologação (Barueri)

**Objetivo:** emitir NFS-e de teste contra o `testeeiss` de Barueri.

- [ ] Cadastrar empresa(s) no Focus (endpoint **produção**, com A1, `habilita_nfse`, inscrição municipal). Guardar `token_homologacao` no Vault.
- [ ] Preencher `fiscal_company_settings` (LC116, código tributário, alíquota ISS, `ambiente=homologacao`).
- [ ] Edge Function `nfse-worker`: drena `nfse_emit`, monta payload, `POST /v2/nfse?ref=`.
- [ ] Edge Function `focus-webhook`: idempotente, atualiza job, baixa XML+DANFSe → Storage, write-back `transaction`+`audit_log`.
- [ ] `pg_cron` `nfse-reconcile` (5 min) para jobs presos.
- [ ] **Forçar uma rejeição** (ex.: inscrição inválida) e expor `mensagem_sefaz` no dashboard.

**Critério de pronto:** nota de teste autorizada por Barueri, XML/PDF no Storage, e um caso de erro tratado e visível. **Sem valor fiscal.**

---

## Fase 4 — UI no dashboard

**Objetivo:** operar a esteira pelo SPA.

- [ ] Feature `nfse/`: fila de revisão (jobs `pending_review`), aprovar/rejeitar.
- [ ] Detalhe do job: status, `mensagem_sefaz`, download XML/DANFSe.
- [ ] Ação **reemitir** (job `rejected`).
- [ ] Toggle `emission_mode` por empresa + kill-switch.
- [ ] Indicadores: jobs por status, falhas, DLQ.

---

## Fase 5 — Camada 3: ensaio geral + virada para produção

- [ ] E2E homologação: sandbox pagar.me → pipeline → Focus homolog. → write-back.
- [ ] Checklist de produção: tokens de produção no Vault, `ambiente=producao`, webhook pagar.me produção, e-mails reais.
- [ ] Habilitar 1 empresa em produção (modo `manual`) como piloto.
- [ ] Monitorar, então liberar `automatic`.

---

## Riscos e mitigações

| Risco                                      | Mitigação                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Código LC116/tributário errado p/ Barueri  | Validar na Fase 3 com rejeição controlada; confirmar com contador.                         |
| Cadastro do tomador incompleto no pagar.me | Validação na explosão do split; job vai a `failed` com motivo claro.                       |
| Webhook duplicado (ambos terceiros)        | Idempotência por `event_id` / `focus_ref`.                                                 |
| Webhook Focus não assinado                 | Token-segredo na URL + validação.                                                          |
| Job preso (sem webhook)                    | `nfse-reconcile` via polling.                                                              |
| Pico de volume (>6k/mês)                   | fila por status + worker idempotente (`SKIP LOCKED`); plano B = pgmq ou Cloudflare Queues. |

---

## Sequenciamento sugerido (entregas pequenas)

1. **Fase 0 + Fase 1** juntas (banco + lógica interna testada) — maior valor, zero dependência externa.
2. **Fase 2** (pagar.me sandbox).
3. **Fase 3** (Focus homologação) — caminho crítico.
4. **Fase 4** (UI) — pode andar em paralelo à Fase 3.
5. **Fase 5** (produção piloto).
