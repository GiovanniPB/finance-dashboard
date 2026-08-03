# Relatórios em PDF — Plano de Implementação

> Página dedicada para **montar e exportar relatórios gerenciais em PDF**: escolher período,
> quais gráficos e tabelas entram, comparativos, DRE e fluxo de caixa.
> Status: **Fases 0 e 1 concluídas** — pipeline de geração funcionando ponta a ponta
> (capa + DRE multipágina em PDF). Ver §8 e §11.

---

## 1. Objetivo

Hoje o dashboard tem análise **na tela** (visão geral, DRE, fluxo de caixa) e exportação de
dados **crua** (CSV por tabela). Falta o meio: um documento **apresentável** — para conselho,
sócios, contador ou banco — que combine capa, indicadores, gráficos e demonstrativos num
PDF só, com período e conteúdo configuráveis.

A ferramenta é **composicional**: o usuário monta o relatório escolhendo blocos de um catálogo,
ordena, define o período e o eixo de comparação, pré-visualiza e exporta. Configurações úteis
viram **templates salvos** para reexecutar todo mês.

### Não é objetivo (v1)

- Substituir o `/reports` atual (análises exploratórias com CSV) — os dois coexistem.
- Relatório agendado / enviado por e-mail (exige render server-side — ver §10).
- Comparação entre empresas do grupo lado a lado, e orçado vs. realizado (ver §10).

---

## 2. Decisões tomadas

| Decisão          | Escolha                                                                                              | Consequência                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Motor de PDF** | Bibliotecas client-side (`jsPDF` + `jspdf-autotable` + `svg2pdf.js`), carregadas por import dinâmico | Geração no clique, sem diálogo do navegador, sem serviço externo, sem segredo novo |
| **Templates**    | Persistidos no banco (`report_templates` + RLS) já na v1                                             | Uma migration nova + regen de `src/types/database.ts`                              |
| **Comparativos** | Período anterior (MoM) e ano anterior (YoY)                                                          | Reusa `dre_comparison` e o par `kpi_dashboard(ano)` / `kpi_dashboard(ano-1)`       |

### Alternativas descartadas e por quê

- **Print nativo do navegador** (`window.print()` sobre páginas A4 em DOM) — descartado por
  decisão de produto. Era a opção de menor esforço e maior fidelidade visual (reusava os
  gráficos Recharts como vetor, tipografia idêntica à do app, zero dependência), mas obriga o
  usuário a passar pelo diálogo de impressão e escolher "Salvar como PDF".
- **Render server-side** (headless Chrome) — descartado por decisão de produto. Edge Function
  do Supabase é Deno e **não roda Chrome**, então exigiria serviço externo (Cloudflare Browser
  Rendering, Browserless, Gotenberg auto-hospedado), custo recorrente, segredo no Vault e uma
  esteira de jobs. É o único caminho que habilita relatório agendado — fica no roadmap (§10).
- **`@react-pdf/renderer`** — considerado e preterido em favor de `jsPDF`: ~3× o bundle, e os
  6 gráficos existentes teriam de ser **reimplementados** nas primitivas dele. Com `svg2pdf`
  aproveitamos a geometria/escalas/eixos que o Recharts já resolve.
- **`html2canvas` / `jsPDF.html()`** — descartado tecnicamente: rasteriza o DOM (texto vira
  bitmap) e **quebra com `oklch()`**, que é exatamente o espaço de cor dos 60 tokens em
  `src/styles/tokens.css`.

---

## 3. Restrições técnicas descobertas no código

Três achados da inspeção que **condicionam o desenho** — não são detalhes de implementação:

**3.1. Nenhuma biblioteca de PDF entende as cores do projeto.**
Os gráficos pintam com `fill="var(--color-accent)"` e literais `oklch(58% 0.22 285)`
([`ExpenseDonut.tsx:9-19`](../../src/features/kpis/components/ExpenseDonut.tsx),
[`YoYBarChart.tsx:69`](../../src/features/kpis/components/YoYBarChart.tsx)). Um SVG
serializado e destacado do documento **perde o acesso às CSS vars**, e `jsPDF`/`svg2pdf` não
parseiam `oklch()`.
→ **Paleta de impressão explícita em hex**, num módulo TS (`reportTheme.ts`), passada aos
gráficos por prop. Determinística, testável, sem conversão de cor em runtime. Bônus: impressão
pede contraste e fundo branco diferentes da tela — a paleta de print **deve** ser sua própria coisa.

**3.2. Os gráficos precisam de parametrização mínima para render fora da tela.**
`ResponsiveContainer` exige pai dimensionado, e `Area`/`Bar` animam por padrão — o SVG do
primeiro frame **não é o final**.
→ Cada gráfico ganha props opcionais de cor e `isAnimationActive`, com default = comportamento
atual. O dashboard não muda; o modo print passa hex e desliga animação.

**3.3. `Tooltip` e `Legend` do Recharts são HTML, não SVG.**
Não entram no SVG serializado.
→ Tooltip é irrelevante em PDF. **Legendas passam a ser desenhadas por nós** no PDF (o que dá
controle editorial melhor de qualquer forma).

**3.4. Fontes embutidas do jsPDF são WinAnsi (Latin-1).**
Acentuação do português (`ç ã é õ`) e travessão funcionam. **Setas `↑ ↓` e símbolos fora do
Latin-1 não.**
→ v1 usa Helvetica (neutra, adequada a documento financeiro) e **evita glifos fora do
Latin-1** nos textos gerados — variação se expressa por sinal e cor, não por seta. Fonte
própria (Inter/Geist via TTF) é opcional e posterior.

**3.5. Escopo consolidado tem menos blocos disponíveis.**
Só `kpi_dashboard`, `dre` e `expense_breakdown` têm variante consolidada. `cashflow_daily/monthly`,
`bank_balances`, `cost_center_analysis`, `counterparty_analysis` e `forecast_cashflow_daily`
recebem `p_company_id` e **só existem por empresa**.
→ O catálogo de blocos declara compatibilidade de escopo, e a UI **desabilita com explicação**
os blocos incompatíveis quando o escopo é consolidado. Sem isso, o usuário monta um relatório
que falha na geração.

---

## 4. Arquitetura

Quatro camadas, com uma fronteira dura entre **o que entra** e **como sai**:

```
┌─ ReportConfig (Zod, serializável) ──────────── escopo, período, comparativo, blocos[], opções
│     ↕ URL (nuqs)  ·  ↕ report_templates (Postgres)
├─ Camada de dados ───────────────────────────── hooks/RPCs existentes → ReportData (snapshot)
├─ Layout / paginação ───────────────────────── paginate(blocks, data) → Page[]   [puro, testável]
└─ Driver de saída ──────────────────────────── PdfDriver.render(Page[]) → Blob
                                                  └─ jsPdfDriver (v1)
```

A `ReportConfig` e as camadas de dados/layout são **agnósticas de saída**. Se um dia entrar um
driver server-side (§10), ele consome `Page[]` sem tocar em config, dados ou blocos.

**Preview = o PDF de verdade.** O painel de pré-visualização exibe o `Blob` gerado num
`<iframe>`. Não existe caminho de render paralelo em DOM — logo, **não existe divergência
possível** entre preview e arquivo final, e cada bloco é escrito uma única vez.

### Estrutura de arquivos

```
src/features/report-builder/
├── schema.ts              # ReportConfig (Zod) + versionamento
├── period.ts              # resolução de período e comparativo (puro)
├── generate.ts            # fronteira de import dinâmico (jspdf entra só aqui)
├── blocks/
│   └── catalog.ts         # catálogo: rótulo, grupo, escopo, altura estimada
├── data/
│   ├── types.ts           # ReportData (snapshot)
│   └── fetchReportData.ts # busca só o que os blocos escolhidos precisam
├── layout/
│   ├── cursor.ts          # puro: onde desenhar e quando quebrar a página
│   └── cursor.test.ts
├── pdf/
│   ├── driver.ts          # contrato de bloco + contexto de render
│   ├── jsPdfDriver.ts     # orquestrador: doc -> blocos -> cabeçalho/rodapé -> Blob
│   ├── primitives.ts      # texto, régua, retângulo, conversão pt<->mm
│   ├── chrome.ts          # cabeçalho corrido e rodapé com "Página X de Y"
│   ├── reportTheme.ts     # paleta de impressão em hex + tipografia + métricas A4
│   ├── chartCapture.ts    # (fase 2) render offscreen -> SVG serializado
│   └── blocks/            # um arquivo por bloco + registro em index.ts
├── components/            # (fase 3) UI do builder
├── api.ts                 # (fase 4) CRUD de report_templates
└── hooks.ts               # (fase 4) TanStack Query
src/routes/report-builder.tsx
supabase/migrations/<ts>_report_templates.sql
docs/features/relatorios-pdf-plan.md   # este arquivo
```

Rota: **`/reports/builder`**, item próprio na sidebar ("Exportar Relatório", módulo
`financials`), preservando o `/reports` atual intacto.

---

## 5. Catálogo de blocos

Todos os dados vêm de RPCs **que já existem** — a v1 não precisa de RPC nova.

| #   | Bloco                        | Fonte                                 | Render            | Consolidado |
| --- | ---------------------------- | ------------------------------------- | ----------------- | ----------- |
| 1   | Capa                         | config                                | texto             | ✅          |
| 2   | Sumário executivo (KPIs YTD) | `kpi_dashboard[_consolidated]`        | cards             | ✅          |
| 3   | Receita & Resultado mensal   | `kpi_dashboard.monthly`               | barras            | ✅          |
| 4   | Receita bruta YoY            | `kpi_dashboard` ano / ano−1           | barras            | ✅          |
| 5   | Receita acumulada YoY        | idem                                  | área              | ✅          |
| 6   | Lucro líquido YoY            | idem                                  | barras            | ✅          |
| 7   | Despesas por categoria       | `expense_breakdown`                   | rosca + tabela    | ✅          |
| 8   | DRE (competência + caixa)    | `dre_by_company` / `dre_consolidated` | tabela            | ✅          |
| 9   | DRE comparativo (MoM/YoY)    | `dre_comparison`                      | tabela + variação | ❌          |
| 10  | Fluxo de caixa               | `cashflow_daily` / `cashflow_monthly` | linha + tabela    | ❌          |
| 11  | Saldos bancários             | `bank_balances`                       | tabela            | ❌          |
| 12  | Centros de custo             | `cost_center_analysis`                | tabela + barras   | ❌          |
| 13  | Contrapartes (top N)         | `counterparty_analysis`               | tabela            | ❌          |
| 14  | Forecast 90 dias             | `forecast_cashflow_daily`             | linha             | ❌          |
| 15  | Notas / comentários          | texto livre                           | texto             | ✅          |
| 16  | Quebra de página             | —                                     | —                 | ✅          |

Cada entrada do catálogo é **dado, não código condicional**: `{ id, label, group, scopes,
comparisons, estimatedHeight, fetch, draw }`. Adicionar bloco novo = adicionar uma entrada.

### Período e a ressalva do `kpi_dashboard`

O relatório tem **um período global** (`from`/`to`) mais o eixo de comparação. Mas
`kpi_dashboard` recebe **`p_year`**, não `from`/`to` — os blocos 2–6 são inerentemente anuais.
Na v1 eles derivam o ano do fim do período selecionado e rotulam isso de forma explícita no
PDF ("YTD 2026"), para o número nunca ser ambíguo. Um RPC que aceite `from`/`to` é evolução
posterior, não bloqueio.

---

## 6. Banco de dados

Uma migration: `report_templates`. O template é **metadado de configuração**, não dado
financeiro — a proteção dos números continua nos RPCs com RLS na hora de gerar.

```sql
create table public.report_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_id      uuid references public.companies(id) on delete cascade,  -- null = consolidado
  name            text not null,
  description     text,
  config          jsonb not null default '{}',   -- ReportConfig serializada (com `version`)
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'
);
```

- Helper novo `public.has_organization_access(uuid)` — não existe equivalente hoje, e é
  necessário porque template consolidado tem `company_id is null`. Segue o padrão de
  `has_company_access`: super admin passa direto, senão exige acesso a ao menos uma empresa da org.
- RLS no padrão de [`20260707200242_permissions_rls_read_write_module.sql`](../../supabase/migrations/20260707200242_permissions_rls_read_write_module.sql):
  - `SELECT`: `has_organization_access(organization_id) and can_view_module('financials')`
  - escrita: `has_organization_access(...)` **e** `has_company_write_access(company_id)` quando
    `company_id` não é nulo (viewer não escreve)
- Triggers `trg_report_templates_updated` e `trg_audit_report_templates`, como nas outras tabelas.
- `config` guarda `version` para migração progressiva do schema Zod.
- Regenerar `src/types/database.ts` **no mesmo PR** (`bun run db:types:local`).

---

## 7. UI do builder

Três painéis, com o preview sempre visível:

```
┌ Catálogo ─────┬ Composição ────────────────┬ Preview (iframe, PDF real) ─┐
│ [+] KPIs      │ 1. Capa                ⋮ ✕ │  ┌───────────────────┐      │
│ [+] Gráficos  │ 2. Sumário executivo   ⋮ ✕ │  │  página 1 de 12   │      │
│ [+] DRE       │ 3. Receita & Result.   ⋮ ✕ │  │                   │      │
│ [+] Fluxo     │ 4. DRE                 ⋮ ✕ │  └───────────────────┘      │
│ [+] Notas     │    ↳ opções do bloco       │  [◀ ▶]   [Gerar PDF]        │
└───────────────┴────────────────────────────┴─────────────────────────────┘
    Escopo: [Consolidado ▾]  Período: [01/01 → 31/07]  Comparar: [YoY ▾]
    Template: [Mensal Diretoria ▾] [Salvar] [Salvar como…]
```

- **Escopo/período/comparativo** são globais; cada bloco pode sobrescrever pontualmente (ex.:
  top N de contrapartes).
- Blocos incompatíveis com o escopo aparecem **desabilitados com o motivo** (§3.5).
- Reordenação por arrastar; toda a composição vive na **URL via nuqs** → link compartilhável,
  e o mesmo objeto serializado é o que se salva como template.
- Preview **debounced** — regenerar o PDF a cada tecla é desperdício. Botão explícito de
  atualizar quando a config muda muito.

---

## 8. Fases de implementação

Cada fase é um PR coeso, com `bun run preflight` verde.

| Fase                   | Entrega                                                                                                                             | Verificação                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **0. Fundação**        | `schema.ts` (Zod + versionamento), `catalog.ts`, `reportTheme.ts`. Sem UI.                                                          | Testes de parse/default/versão do schema                              |
| **1. Pipeline mínimo** | `PdfDriver` + `jsPdfDriver` (import dinâmico), `paginate.ts`, blocos **Capa + DRE** (autoTable). Botão que baixa PDF de verdade.    | `paginate.test.ts`; PDF de DRE longa paginando com cabeçalho repetido |
| **2. Gráficos**        | `chartCapture.ts`, parametrização de cor/animação nos 5 gráficos, `svg2pdf`. Blocos 3–7, 10, 12, 14.                                | Inspeção visual gráfico a gráfico; decidir vetor vs. PNG por gráfico  |
| **3. Builder UI**      | Rota, 3 painéis, drag-reorder, estado em nuqs, preview em iframe, escopo/período/comparativo, blocos restantes                      | Vitest nos redutores de config; conferir gate de escopo consolidado   |
| **4. Templates**       | Migration + `has_organization_access` + RLS + triggers, regen de types, `api.ts`/`hooks.ts`, UI de salvar/carregar/duplicar/excluir | `bun run db:reset` do zero; teste de RLS com viewer/editor/admin      |
| **5. Acabamento**      | Cabeçalho/rodapé, "Página X de Y", metadados e nome do arquivo, estados vazios/erro/carregando, docs                                | `preflight`; revisão de cobertura ≥80% na lógica                      |

**Ordem deliberada:** a Fase 1 fecha o pipeline ponta a ponta com o bloco mais difícil (tabela
longa, multipágina) **antes** de investir em UI. Se `jsPDF`+`autoTable` decepcionar, o custo do
recuo é uma fase, não o projeto. Gráficos vêm na 2 porque são o maior risco técnico isolado
(§3.1–3.3) e devem ser validados com o olho antes de qualquer polimento.

---

## 9. Riscos

| Risco                                                                    | Prob. | Mitigação                                                                                              |
| ------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------ |
| `svg2pdf` distorcer gradientes (blocos 5 e o hero usam `linearGradient`) | Média | Decisão **por gráfico** na Fase 2; fallback = rasterizar em canvas a 3× e embutir como imagem          |
| Paginação de bloco mais alto que a página                                | Média | `paginate()` puro e testado; `autoTable` já resolve o caso das tabelas longas                          |
| Bundle das libs (~150 kb gz)                                             | Baixa | Import dinâmico, como já se faz com `xlsx` em [`nfse/export.ts:83`](../../src/features/nfse/export.ts) |
| Glifo fora do Latin-1 sair errado (§3.4)                                 | Média | Lint de conteúdo gerado; sem setas em texto de PDF                                                     |
| Preview lento com muitos blocos                                          | Média | Debounce + regeneração sob demanda; `paginate()` não refaz fetch                                       |
| Fadiga de configuração (tela em branco)                                  | Média | 3 templates de fábrica ("Mensal Diretoria", "Trimestral Sócios", "Fechamento Contábil")                |

---

## 10. Roadmap pós-v1

1. **Comparação entre empresas do grupo** lado a lado + linha do consolidado (exige RPCs novos
   ou N chamadas paralelas por empresa).
2. **Orçado vs. realizado** — precisa de schema de orçamento (tabela de budget por conta/mês),
   que hoje não existe.
3. **Variantes consolidadas** de `cashflow`, `cost_center_analysis` e `counterparty_analysis`,
   liberando os blocos 10–14 no escopo consolidado (§3.5).
4. **RPC de KPI por `from`/`to`**, removendo a ressalva anual de §5.
5. **Relatório agendado por e-mail** — o único item que **exige** driver server-side e serviço
   externo de render. A fronteira de driver da §4 existe para que isso não seja reescrita.

---

## 11. Desvios do plano durante a implementação

Registrados aqui porque contradizem o que as seções acima descrevem, e o motivo importa.

**11.1. `layout/paginate.ts` virou `layout/cursor.ts` — paginação emergente, não pré-calculada.**
O plano previa uma função pura `paginate(blocos, alturas) → Page[]`. Ao implementar ficou claro
que o `autoTable` pagina tabelas longas por conta própria e só informa onde parou **depois** de
desenhar. Pré-calcular a altura de uma tabela exigiria replicar a lógica de altura de linha dele
— frágil e duplicada. Então cada bloco pede espaço a um cursor, que decide a quebra, e blocos
que paginam sozinhos devolvem a posição final via `syncTo`. O cursor continua puro e testável
(recebe `onNewPage` por injeção, não conhece jsPDF).

**11.2. `data/useReportData.ts` virou `data/fetchReportData.ts` — função assíncrona, não hooks.**
A lista de blocos é dinâmica e **hooks do React não podem ser chamados condicionalmente**.
Orquestrar com `useQuery` exigiria montar todos os hooks sempre e desabilitar os não usados.
Como a geração é uma ação pontual, buscar direto elimina o problema na raiz. As funções chamadas
são as mesmas dos hooks, então seguem protegidas por RLS.

**11.3. Defaults acrescentados em `document` e `blocks` no schema raiz.**
Não estava previsto. Garante que um template salvo por uma versão anterior do schema continue
carregando em vez de derrubar a tela — importa a partir da Fase 4.

**11.4. `html2canvas` entrou no `dist` como dependência do jsPDF.**
São ~202 kB (47 kB gz) num chunk separado. O jsPDF o importa **dinamicamente**, só para
`doc.html()`, que não usamos — verificado no bundle (`import("./html2canvas.esm-*.js")`).
Custo de runtime zero; é peso morto em disco. Fica registrado por ser justamente a biblioteca
que a §2 descarta.
