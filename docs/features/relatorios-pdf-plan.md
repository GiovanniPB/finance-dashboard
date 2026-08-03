# Relatórios em PDF — Plano de Implementação

> Página dedicada para **montar e exportar relatórios gerenciais em PDF**: escolher período,
> quais gráficos e tabelas entram, comparativos, DRE e fluxo de caixa.
> Status: **Fases 0 a 4 concluídas** — builder funcionando, os 16 blocos do
> catálogo implementados, prévia é o próprio PDF e templates salvos no banco com
> RLS. Falta a Fase 5 (acabamento). Ver §8, §11 e §12.

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
│   ├── charts/            # scale, frame, bar, line, donut, legend, geometry
│   └── blocks/            # um arquivo por bloco + registro em index.ts
├── configReducers.ts      # redutores puros da composição
├── useReportConfig.ts     # estado na URL (nuqs) + poda por escopo
├── presets.ts             # 3 composições de fábrica
├── components/            # catálogo, composição, opções, prévia, ajustes
├── api.ts                 # CRUD de report_templates
└── hooks.ts               # TanStack Query
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

Duas colunas: à esquerda o trabalho, à direita o resultado.

```
┌ Ajustes: modelos prontos · período · comparativo · título · documento ────────┐
├───────────────────────────────────────────┬──────────────────────────────────┤
│ Adicionar blocos (chips agrupados)        │ Prévia — o PDF de verdade        │
│  ESTRUTURA +Capa +Notas +Quebra           │  ┌────────────────────────┐      │
│  GRÁFICOS +Receita bruta (YoY) …          │  │  página 1 de 6         │      │
├───────────────────────────────────────────┤  │                        │      │
│ Composição                                │  │  (fixa ao rolar)       │      │
│  1. Capa                       ⌃ ⌄ ⚙ ✕   │  └────────────────────────┘      │
│  2. Sumário executivo          ⌃ ⌄ ⚙ ✕   │  [Atualizar] [Baixar PDF]        │
└───────────────────────────────────────────┴──────────────────────────────────┘
```

- **Escopo/período/comparativo** são globais; cada bloco pode sobrescrever pontualmente (ex.:
  top N de contrapartes).
- Blocos incompatíveis com o escopo aparecem **desabilitados** (§3.5), com o motivo no `title` e
  resumidos num rodapé — depender só de hover esconderia a informação.
- Reordenação por **botões** (único caminho por teclado) e por arrastar.
- Toda a composição vive na **URL via nuqs** → link compartilhável, e o mesmo objeto serializado
  é o que se salva como template.
- Prévia **debounced** e só em mudança estrutural (blocos, período, comparativo, escopo). Digitar
  título não dispara consulta ao banco; para isso existe o botão de atualizar.

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

**11.5. Os gráficos são desenhados direto em jsPDF — sem `svg2pdf`, sem reusar o Recharts.**
Contradiz a §2 (que lista `svg2pdf.js` entre as dependências) e as §§3.1–3.3 (que descreviam
parametrizar os componentes de gráfico e capturá-los fora da tela).

O caminho planejado era: montar o Recharts numa árvore React fora da tela, desligar animação,
injetar a paleta de impressão por prop, serializar o `<svg>` e converter com `svg2pdf`. Ao
implementar, as peças que **não** vinham no reaproveitamento superaram as que vinham:

- `Tooltip` e `Legend` do Recharts são HTML, não SVG (§3.3) — a legenda teria de ser desenhada
  por nós de todo jeito.
- Cor e animação exigiriam alterar os 5 componentes do dashboard, com risco de regressão numa
  tela que já funciona.
- Sobrava do Recharts a geometria de eixos e escalas — que, para os 3 arquétipos de que o
  relatório precisa (barras agrupadas, linha/área, rosca), são ~80 linhas de matemática pura.

Então o relatório tem seu próprio motor de gráficos em `pdf/charts/`: `scale.ts` (domínio
arredondado, escala de faixas), `frame.ts` (calhas, grade, rótulos), e `bar`/`line`/`donut`.
Resultado: nenhuma dependência nova, nada de montar React fora da tela, nada de conversão de
cor em runtime, saída vetorial, e a matemática coberta por testes — 21 casos só em `scale`.

**Uma premissa da escolha da §2 enfraquece com isso:** "reusar os gráficos existentes" era um
dos argumentos a favor do jsPDF contra o `@react-pdf/renderer`. A conclusão não muda — o jsPDF
segue à frente pelo `autoTable` (6 dos blocos são tabelas) e pelo bundle 3× menor —, mas o
argumento do reúso deixou de valer. Os gráficos do PDF e os da tela são implementações
separadas, e mudança de identidade visual precisa ser aplicada nos dois lugares.

**11.6. Duas falhas de alinhamento do autoTable, da mesma família.**
Além do cabeçalho (Fase 1), o `columnStyles.halign` também **não alcança o rodapé** — a linha de
total ficava desalinhada da coluna que soma. Ambas tratadas num só lugar, em `blocks/table.ts`.

**11.7. `null` é diferente de `0` nas séries de gráfico.**
No comparativo anual, mês sem dado no ano corrente vinha como zero. No gráfico de barras isso é
inofensivo (barra de altura zero não aparece), mas no **acumulado** a linha seguia horizontal até
dezembro — lendo como "receita estagnada" em vez de "ainda não há dado". As séries passaram a
aceitar `null`, e o acumulado termina no último mês conhecido.

---

## 12. Polimento pendente (Fase 5)

Itens vistos na inspeção visual que não são defeito, mas merecem ajuste:

- **Eixo negativo consome um passo inteiro.** Com valores de −45 mil contra máximo de 1,4 M, o
  eixo desce até −500 mil e desperdiça ~1/4 da altura do gráfico. Precisa de meio-passo no lado
  negativo sem perder o arredondamento dos ticks.
- **Espaço morto no fim da página** quando o bloco seguinte não cabe. É a paginação por bloco
  funcionando, mas dá para melhorar reordenando blocos baixos.
- **Cabeçalho de coluna longo quebra em duas linhas** no DRE comparativo, quando o rótulo do
  período é extenso ("2026 (até 31/07/2026)"). Legível, mas desalinha a altura do cabeçalho.
- **A prévia real da tela não foi vista** — o layout foi verificado com um harness sem
  autenticação (removido depois), com a prévia em estado de placeholder. O PDF em si foi
  inspecionado página a página, mas a combinação "iframe com PDF de verdade dentro do painel"
  depende de sessão e não foi conferida.

**11.8. A poda de blocos ao trocar de escopo virou parte do estado, não da UI.**
O plano dizia apenas "a UI desabilita blocos incompatíveis". Faltava o caso inverso: o usuário
monta um relatório por empresa e **depois** troca o seletor para consolidado. Sem tratamento, a
composição fica com 6 blocos que aquele escopo não gera e o PDF sai cheio de "sem dados".
`pruneIncompatibleBlocks` remove e **reporta** o que removeu, e a tela avisa por toast — sumir
com o bloco em silêncio seria pior do que deixá-lo quebrado.

**11.9. Reordenação por botões, não só por arrastar.**
A §7 do plano dizia "reordenação por arrastar". Arrastar sozinho torna a ferramenta inoperável
por teclado, então os botões de subir/descer são o caminho principal e o arrastar é complemento.

**11.10. Zero não é despesa.**
Colunas de saída formatavam com `-Math.abs(valor)`, e `-Math.abs(0)` é `-0` — que o
`Intl.NumberFormat` imprime como "-R$ 0,00", em vermelho. Numa tabela de contrapartes onde metade
das linhas só tem entrada, isso enchia a coluna de saídas negativas falsas. Centralizado em
`formatOutflow` / `isNegativeValue`, usado pelos 4 blocos com coluna de saída.

**11.11. O layout de três colunas foi refeito para duas.**
A §7 previa catálogo | composição | prévia lado a lado. Na tela real isso falhou em dois pontos:

- **A prévia colapsou.** O card tinha altura automática e o `iframe` dependia de `h-full` +
  `flex-1` — num ancestral sem altura definida, `h-full` resolve para `auto` e o PDF virou uma
  faixa de ~180px com barra horizontal. Passou a ter altura explícita
  (`h-[calc(100vh-15rem)]`, mínimo 540px) e `#view=FitH` para o visualizador ajustar a página à
  largura.
- **O catálogo tinha ~1400px de altura** — 16 blocos numa coluna de 260px com descrição de três
  linhas cada, empurrando a composição para fora da tela. Virou faixa de chips com título de
  grupo em linha (~200px), com a descrição no `title` e rótulos curtos (`shortLabel`) para caber
  numa linha. Tentei grade e colunas CSS antes: as duas deixavam vazio sob os grupos pequenos,
  porque os grupos vão de 1 a 5 blocos.

Verificado no navegador em 1600×1000, 1440×800 (prévia fixa em `top: 24px`, card de 636px cabendo
na viewport) e 1024×820 (empilha em coluna única, sem overflow horizontal).

**11.12. A migration não concede privilégios de tabela — e isso é de propósito.**
Ao validar RLS localmente, nada funcionava: `permission denied` para `authenticated`. A causa não
era a migration. Os _default privileges_ do schema `public` divergem entre ambientes:

|                             | `authenticated` em tabelas novas        |
| --------------------------- | --------------------------------------- |
| Remoto                      | `arwdDxtm` (DML completo)               |
| Local (`supabase db reset`) | `Dxtm` (só TRUNCATE/REFERENCES/TRIGGER) |

Vale para **todas as 31 tabelas**, não só a nova — `select` em `transactions` também dá 42501 no
local. Como o remoto concede por default privilege, `report_templates` herda em produção. Um
`grant` na migration divergiria de todas as outras tabelas do projeto e mascararia o problema
real, que é do ambiente local. Fica registrado como pendência separada (§13).

**11.13. Escrita em template consolidado é restrita a super admin.**
Não estava no plano. Template com `company_id is null` vale para o grupo inteiro, então
`has_company_write_access` não tem empresa para checar. Deixar qualquer editor gravar ali daria a
um editor de uma empresa poder sobre um artefato do grupo. A UI explica o bloqueio antes da
tentativa falhar.

**11.14. `CHECK` não aceita subquery — a integridade empresa↔organização é FK composta.**
Para garantir que a empresa do template pertence à organização do template, o caminho declarativo
é `foreign key (company_id, organization_id) references companies(id, organization_id)`, o que
exigiu um `unique (id, organization_id)` em `companies`. Com `company_id` nulo a FK não é
verificada (MATCH SIMPLE), que é exatamente o que o escopo consolidado precisa.

---

## 13. Pendência de ambiente (fora do escopo desta feature)

`bun run db:reset` produz um banco local onde **nenhuma tabela** é legível pelo papel
`authenticated` — os default privileges locais concedem `Dxtm` onde o remoto concede `arwdDxtm`.
Consequências:

- RLS não pode ser exercitado localmente sem um `grant` manual (o script de validação desta fase
  faz isso).
- O app rodando contra o banco local com a anon key recebe 403 em tudo.

O conserto certo é uma migration que fixe os default privileges do schema `public`, alinhando
local e remoto — mas isso afeta o projeto inteiro e merece PR próprio, não carona numa feature.
