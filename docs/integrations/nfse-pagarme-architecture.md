# Integração NFS-e (Focus NFe × pagar.me)

> **Status:** desenho aprovado · pré-implementação
> **Contexto:** emitir NFS-e municipal (Barueri) automaticamente a partir das vendas/assinaturas do pagar.me, com split entre empresas do grupo.
> **Stack alvo:** Supabase (Postgres 17 + Edge Functions + Vault + Storage) — sem infra nova. Fila baseada em status na própria `invoice_jobs` (sem pgmq).

---

## 1. Resumo executivo

- **Fonte das vendas:** pagar.me (modelo de **assinatura** com **split** entre 2+ empresas cadastradas na plataforma).
- **Emissor fiscal:** Focus NFe (REST). **O Focus guarda o certificado A1 e assina o XML** — nunca assinamos localmente.
- **Documento:** NFS-e **municipal de Barueri** (provedor próprio EISS, padrão proprietário, **assíncrono**).
- **Regra central:** `1 charge.paid → N NFS-e` (uma por recebedor do split), cada uma sob o CNPJ/token Focus da empresa correspondente, tendo o assinante como **tomador**.
- **Modos de emissão:** `manual` (revisão antes de emitir) e `automatic` — **mesma esteira**, alternados por flag.
- **Volume:** >2.000 cobranças/mês → com split, ~4.000–6.000+ notas/mês → **fila real obrigatória**.

---

## 2. Decisão de infraestrutura

Avaliadas três opções; **escolhida a Supabase-nativa**.

| Critério                           | **A. Supabase-nativo** ⭐                         | B. Cloudflare Workers + Queues | C. API dedicada (Node + Redis) |
| ---------------------------------- | ------------------------------------------------- | ------------------------------ | ------------------------------ |
| Infra nova p/ manter               | Nenhuma                                           | Workers/Queues                 | VPS/PaaS + Redis + deploy      |
| Estado junto dos dados financeiros | Sim (write atômico em `transactions`/`audit_log`) | Não (hop de rede)              | Não                            |
| Reuso de RLS/Auth/Storage          | Total                                             | Parcial (service role)         | Parcial                        |
| Certificado/assinatura             | Irrelevante (Focus faz)                           | Irrelevante                    | Irrelevante                    |
| Fila retry/DLQ                     | fila por status (KISS, sem extensão)              | Excelente                      | Excelente                      |
| Custo / superfície de segurança    | Menor                                             | Baixo                          | Maior                          |

**Racional:** como o Focus elimina a assinatura local, o trabalho é puramente orquestração de I/O. Colocar a máquina de estados no mesmo Postgres dos dados financeiros dá integridade transacional, reaproveita toda a RLS existente e mantém a superfície operacional mínima (princípio "DevOps antes de feature"). Opção B é o plano B caso bata em limite de Edge Function. Opção C foi descartada (assumir uptime de caminho fiscal crítico sem ganho real).

---

## 3. Arquitetura

```
                          ┌──────────────────────────────────────────────┐
   pagar.me              │              SUPABASE (já existe)               │
  (assinaturas,          │  ┌────────────────┐    ┌──────────────────┐    │
   charges, split)       │  │ Edge Function  │    │   Postgres 17    │    │
        │ webhook         │  │ pagarme-webhook│───►│  sales_events    │    │
        ├────────────────►│  │ (verifica sig, │    │  (ingest idemp.) │    │
        │ charge.paid     │  │  explode split)│    │        │         │    │
        │                 │  └────────────────┘    │        ▼         │    │
        │                 │                         │  invoice_jobs    │    │
        │                 │  ┌────────────────┐    │  (1 por empresa  │    │
        │                 │  │ fila por status │◄───┤   do split)      │    │
        │                 │  │ (status=queued) │    │  + recipient_map │    │
        │                 │  └───────┬────────┘    │  + fiscal_settings│   │
        │                 │          │             │  + service_catalog│   │
   Focus NFe ◄────────────┼──┌───────▼────────┐    │  Vault: tokens   │    │
   POST /v2/nfse          │  │ nfse-worker    │────┼──Storage: XML/PDF │   │
        │                 │  │ (pg_cron drena)│    └──────────────────┘    │
        │ webhook status  │  └────────────────┘           ▲                │
        └────────────────►│  ┌────────────────┐           │ write-back     │
                          │  │ focus-webhook  │───────────┘ (transaction +  │
                          │  │ (autorizado/erro)            audit_log)      │
                          │  └────────────────┘                            │
                          │  ┌────────────────┐                            │
                          │  │ pg_cron reconcile (5min): jobs presos →     │
                          │  │ GET /v2/nfse/{ref}  (rede de segurança)     │
                          │  └────────────────┘                            │
                          └──────────────────────────────────────────────┘
                                         ▲ leitura via RLS (anon key)
                          ┌──────────────┴───────────────┐
                          │  SPA Vite (Cloudflare Pages)  │
                          │  fila de revisão · aprovar ·  │
                          │  reemitir · baixar PDF/XML    │
                          └───────────────────────────────┘
```

### Componentes

| Componente        | Tipo                        | Responsabilidade                                                                                                                           |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pagarme-webhook` | Edge Function (pública)     | Verifica origem, grava `sales_events` (idempotente), explode `split[]` em `invoice_jobs`, enfileira os elegíveis. Responde 2xx rápido.     |
| `nfse-worker`     | Edge Function (via pg_cron) | Reivindica jobs `status='queued'` (`FOR UPDATE SKIP LOCKED`), monta payload NFS-e, `POST /v2/nfse?ref=`, marca `processing_authorization`. |
| `focus-webhook`   | Edge Function (pública)     | Grava `focus_events` (idempotente), atualiza `invoice_jobs` pelo `ref`, baixa XML/DANFSe → Storage, escreve `transaction` + `audit_log`.   |
| `nfse-reconcile`  | pg_cron (5 min)             | Varre jobs presos em `processing_authorization` sem webhook → `GET /v2/nfse/{ref}`. Aplica retry/DLQ.                                      |

---

## 4. Fluxo do split (o coração)

1. `charge.paid` de um ciclo de assinatura chega ao `pagarme-webhook`.
2. Grava o evento bruto em `sales_events` (dedup por `event_id`).
3. Lê `split[]` do charge. Para cada `recipient_id`:
   - resolve a empresa via `pagarme_recipient_map` (`recipient_id → company_id`);
   - calcula a **fatia de valor** daquele recebedor;
   - resolve a classificação fiscal via `service_catalog` (LC116, código tributário municipal, alíquota ISS);
   - cria **um `invoice_job`** com a fatia, o tomador (assinante) e o `ambiente` da empresa.
4. **Modo manual** → job nasce `pending_review` (gate no dashboard). **Modo automático** → entra direto em `queued`. As linhas `queued` **são** a fila (o `nfse-worker` as reivindica com `FOR UPDATE SKIP LOCKED`).
5. **Invariante:** a soma das fatias dos jobs = valor total do charge.

---

## 5. Modelo de dados

Schema `public`, RLS por `has_company_access` (leitura/operação no dashboard) e service role das Edge Functions (escrita). **Implementado** na migration [`supabase/migrations/20260602144027_nfse_schema.sql`](../../supabase/migrations/20260602144027_nfse_schema.sql) (enums `nfse_ambiente`, `nfse_padrao`, `nfse_emission_mode`, `invoice_job_status`). A **fila é baseada em status**: `invoice_jobs` com `status='queued'` são o trabalho; o worker reivindica com `FOR UPDATE SKIP LOCKED`. O rascunho original em [`sql/nfse-schema-draft.sql`](./sql/nfse-schema-draft.sql) está **superado** por esta migration.

| Tabela                    | Papel                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fiscal_company_settings` | 1:1 com `companies`. `ambiente`, `emission_mode`, inscrição municipal, `municipio_ibge`, LC116 padrão, alíquota ISS, `focus_token_ref` (→ Vault), kill-switch. |
| `pagarme_recipient_map`   | Ponte `pagarme_recipient_id (rp_/re_) → company_id`.                                                                                                           |
| `service_catalog`         | Classificação fiscal por empresa/plano (LC116, código municipal, ISS). Resolve o que o pagar.me não fornece.                                                   |
| `sales_events`            | Ingest bruto do webhook pagar.me, idempotente por `event_id`.                                                                                                  |
| `invoice_jobs`            | Unidade de trabalho = uma NFS-e pretendida. Estado, `focus_ref` único, fatia do valor, snapshot do tomador, resultado Focus.                                   |
| `focus_events`            | Ingest bruto do webhook Focus, idempotente.                                                                                                                    |

### Máquina de estados do `invoice_job`

```
                    (modo manual)
  criado ──► pending_review ──aprovar──► queued ──► submitting ──► processing_authorization
     │            │                         ▲                              │
     │ (modo      │ rejeitar                │ reemitir (mesmo ref só vale   ├─► authorized
     │ automático)▼                         │  se NÃO autorizou)            │
     └──────► queued                     rejected ◄───── erro_autorizacao ──┘   (lê mensagem_sefaz)
```

> **`focus_ref`**: alfanumérico **sem hífen** (restrição do Focus). Gerar a partir do UUID do job removendo os hífens. Único por token; uma vez **autorizada**, a `ref` não pode ser reutilizada.

---

## 6. Segurança

- **Segredos no Vault:** `secret_key` pagar.me + `token_homologacao`/`token_producao` por empresa. Tabelas guardam apenas a _referência_ (`focus_token_ref`), nunca o valor.
- **Origem dos webhooks:**
  - pagar.me: Basic auth/segredo na URL configurada + validação.
  - Focus: **não assina o webhook** → proteger a URL com token-segredo (path/query) e validar.
- **Idempotência nas duas pontas:** dedup por `event_id` (pagar.me) e `focus_ref` único (Focus). O mesmo evento pode chegar 2x.
- **RLS:** tabelas novas legíveis por usuários com `has_company_access`; escrita só via service role (Edge Functions).
- **LGPD:** snapshot mínimo do tomador (documento, nome, e-mail, endereço) — apenas o necessário para a nota.
- **Frontend nunca** toca segredos nem chama Focus/pagar.me direto — só lê via RLS.

---

## 7. Particularidades de Barueri (NFS-e municipal)

- Provedor próprio **EISS**, padrão proprietário. `item_lista_servico` segue a tabela deles — código errado = rejeição.
- Emissão **assíncrona** → webhook + polling obrigatórios.
- `inscricao_municipal`: **apenas números e letras** (sem pontuação).
- Tomador: CPF/CNPJ + **endereço completo** obrigatórios.
- Cancelamento **é suportado** via API (fora de escopo agora).
- Código IBGE: **3505708**.
- Ambientes: produção `barueri.sp.gov.br/nfe/` · homologação `testeeiss.barueri.sp.gov.br/nfe/`.

---

## 8. Ambientes (homologação × produção)

|                | Homologação                      | Produção                 |
| -------------- | -------------------------------- | ------------------------ |
| Base URL Focus | `homologacao.focusnfe.com.br/v2` | `api.focusnfe.com.br/v2` |
| Token          | `token_homologacao`              | `token_producao`         |
| Valor fiscal   | Não                              | Sim                      |

⚠️ A **API de Empresas** do Focus (cadastro + upload do A1) só roda em **produção**, mesmo para emitir em homologação. Cadastra-se a empresa uma vez (produção) e usa-se o `token_homologacao` para as notas de teste. Virada para produção = trocar `ambiente` + token. Sem reescrita.

---

## 9. Decisões registradas

- ✅ NFS-e **municipal** (Barueri), não Nacional.
- ✅ **Cancelamento fora de escopo** nesta fase.
- ✅ **Começar em homologação**, validar em camadas (ver plano).
- ✅ Infra **Supabase-nativa** (Edge Functions + fila por status na `invoice_jobs`, sem pgmq).
- ✅ Esteira única para `manual` + `automatic` (flag por empresa).

## 10. Em aberto / próximos refinamentos

- Confirmar `item_lista_servico` (LC116) e código tributário municipal reais de cada empresa.
- Validar qualidade do cadastro do tomador no pagar.me (documento + endereço completos).
- Definir política de retry/DLQ e alertas (job `failed`).
- Mapeamento plano pagar.me → serviço no `service_catalog`.

---

_Fontes: [Focus NFe — Barueri](https://focusnfe.com.br/guides/nfse/municipios-integrados/barueri-sp/) · [Municípios Integrados NFS-e](https://focusnfe.com.br/cidades-integradas-nfse/) · `focusnfe.md` · `pagarme.md` (raiz do repo)._
