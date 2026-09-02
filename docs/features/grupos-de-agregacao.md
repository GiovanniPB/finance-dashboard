# Grupos de agregação — consolidação seletiva

Referência técnica do recorte de empresas: o que é, onde vive, o que cada tela faz com
ele e quais invariantes não podem ser violadas.

## O problema

O escopo de empresa tinha dois estados: **uma empresa** ou **Consolidado** (todas as
operacionais da organização). Não havia como olhar um recorte — as duas empresas do braço
OTM sem a educação financeira, por exemplo. Quem precisava do número somava DRE de duas
telas na mão, e nada garantia que a soma manual usasse o mesmo critério de status e
competência que o consolidado do sistema.

## O modelo

Três formas de escopo, resolvidas em [`resolveScope.ts`](../../src/features/companies/resolveScope.ts):

| `scopeKind`    | Chave persistida | `companyIds`  | Significado                               |
| -------------- | ---------------- | ------------- | ----------------------------------------- |
| `company`      | `<uuid>`         | `[id]`        | uma empresa                               |
| `consolidated` | `consolidated`   | `null`        | todas as operacionais que a RLS deixa ver |
| `group`        | `group:<uuid>`   | `[id, id, …]` | recorte nomeado (consolidação seletiva)   |

`companyIds` é o contrato único: `null` = sem recorte (quem limita é a RLS); array =
exatamente estas empresas. Array **vazio** filtra tudo fora de propósito.

**Não existe `isConsolidated` booleano.** Com três formas, um booleano obrigaria cada tela
a adivinhar de que lado o grupo cai, e o erro silencioso — mostrar 4 empresas sob o rótulo
de um recorte de 2 — é o pior defeito possível aqui. Quem precisa de "é mais de uma
empresa?" usa `isMultiCompany`; quem precisa distinguir consolidado de recorte usa
`scopeKind`. A remoção do booleano foi deliberada: fez o `tsc` apontar as 29 telas que
consomem escopo, uma por uma, em vez de deixá-las herdar um comportamento por acidente.

## Banco

Migration [`…_grupos_de_agregacao.sql`](../../supabase/migrations/20260902133857_grupos_de_agregacao.sql).

- **`company_groups`** — recortes nomeados, compartilhados na organização. Nome único por
  organização, sem depender de caixa nem de espaço nas pontas.
- **`company_group_members`** — empresas de cada grupo. Tem PK própria (`id`) porque
  `audit_record()` grava `coalesce(new.id, old.id)` e falha em tabela sem coluna `id` —
  e auditar composição de grupo importa: mudar quem entra no recorte muda todo número
  que a tela reporta. FK composta em `organization_id` impede grupo com empresa de outra
  organização.

### Visibilidade: tudo-ou-nada

Um grupo só aparece para quem acessa **todas** as empresas dele. Um DRE rotulado
"Corretora + Assessoria" somando só uma das duas seria um número contábil errado em
silêncio; melhor o grupo não existir para essa pessoa do que existir pela metade.

A regra mora em `visible_company_group_ids()`, `security definer` **sem argumento** — duas
decisões conscientes:

- **`security definer`** porque o predicado precisa varrer `company_group_members`;
  escrevê-lo na policy daquela tabela seria a policy consultando a própria tabela
  (`infinite recursion detected in policy`).
- **sem argumento** para a policy chamá-la dentro de `(select …)`, que o planner resolve
  como InitPlan — avaliado uma vez por statement, não por linha (convenção de RLS do
  CLAUDE.md). Conferido: `Filter: ((InitPlan 1).col1 AND (ANY (id = (hashed SubPlan 2).col1)))`.

Escrita: criar/renomear/apagar exige `admin` ou `editor`; **colocar uma empresa no grupo
exige escrita naquela empresa** (`has_company_write_access(company_id)`), que é o que
impede montar recorte com empresa alheia. As duas tabelas têm o trio restritivo
`oauth_sem_escrita_*` — token de cliente de IA não escreve.

### RPCs

Regra geral: `p_company_ids uuid[] default null`, `null` = comportamento anterior. Nenhuma
chamada existente (app ou servidor MCP) muda de resultado.

| RPC                           | Mudança                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `dre_consolidated`            | + `p_company_ids` (filtro na base do plano-mestre)       |
| `kpi_dashboard_consolidated`  | + `p_company_ids`                                        |
| `expense_breakdown`           | + `p_company_ids`                                        |
| `receivables_schedule`        | + `p_company_ids` (conserva `p_company_id`)              |
| `cashflow_daily` / `_monthly` | implementação virou `_multi`; a de uma empresa é wrapper |
| `forecast_cashflow_daily`     | idem — `forecast_cashflow_daily_multi` + wrapper         |
| `forecast_pagarme_inflow`     | + `p_company_ids` (conserva `p_company_id`)              |

**Por que wrapper e não função irmã:** fluxo de caixa e forecast só tinham a versão de uma
empresa. Duplicar a conta deixaria o número do grupo e o da empresa livres para divergir;
com wrapper, são o mesmo código. `bank_balances_multi` já existia e virou o caminho único
dos saldos.

Sem recorte explícito, as funções multi excluem a holding — mesmo critério do consolidado
de DRE/KPI. Com recorte, respeitam o que o grupo pede.

## Comportamento por tela

**Agregam** o recorte: dashboard, `/dre`, lançamentos, títulos, contas, impostos, vendas,
recorrências, fluxo de caixa, forecast, NF-e/NFS-e, paleta de comandos.

**Operam numa empresa** com o seletor limitado ao escopo (hook
[`useSingleCompanyPicker`](../../src/features/companies/useSingleCompanyPicker.ts)):
importação, folha (colaboradores/rodadas/config), contas bancárias, centros de custo,
conciliação, relatórios gerenciais. Nessas, agregar não faria sentido — a linha do extrato
pertence a uma conta, que pertence a uma empresa; o regime tributário é de cada CNPJ.

**Construtor de relatórios**: grupo entra como o consolidado **restrito** (mesmo `mode`,
com `scope.companyIds`). O catálogo de blocos não mudou — bloco que só existe por empresa
continua só por empresa.

### Consertos que vieram de brinde

- `/cashflow` em consolidado caía **silenciosamente** na primeira empresa operacional
  (`operational[0]?.id`) e rotulava o resultado como "Demo · <empresa>". Agora soma o
  escopo de verdade.
- `/bills`, `/forecast`, `/taxes` bloqueavam a tela inteira em consolidado; agora somam.
- O link de drill-down do fluxo de caixa era escondido sem empresa única, sem necessidade:
  a URL só leva datas e o destino herda o escopo do seletor.

## Invariantes

- **Recorte vazio nunca vira "todas as empresas".** Grupo ainda carregando expõe
  `companyIds: []` e `loading: true` — zeros com skeleton, não o total do grupo inteiro
  sob o rótulo do recorte. Todo hook novo que aceite `companyIds` precisa de
  `enabled: companyIds === null || companyIds.length > 0`.
- **Grupo é tudo-ou-nada na leitura.** Não existe "vista parcial" de grupo.
- **`selectedCompanyId` é nulo em consolidado e em grupo.** Nunca carrega sentinela nem id
  de grupo — telas que operam numa empresa dependem disso para não gravar no lugar errado.
- **Agregação de DRE é do banco, pelo plano-mestre.** Somar DREs de empresa no cliente
  erraria sempre que duas empresas têm planos de contas diferentes.
- **Grupo é recorte de visualização.** Apagar um grupo não afeta lançamento nenhum.

## Verificação feita

No banco local, com dado do seed:

- consolidado (`null`) devolve linha a linha o mesmo que o array com as 4 operacionais;
- DRE do recorte `{Assessoria, Corretora}` = soma dos dois recortes de uma empresa, conta
  por conta (competência e caixa);
- idem para `cashflow_daily_multi` e `forecast_cashflow_daily_multi`, dia a dia;
- os corpos das 4 funções que já agregavam foram **extraídos das migrations originais** e
  receberam só o predicado novo — a equivalência com o original foi conferida recriando as
  versões antigas lado a lado e comparando com `except all` nos dois sentidos (0 linhas de
  diferença), incluindo os wrappers por empresa;
- RLS: `viewer` com acesso a 1 de 4 empresas não vê o grupo de 2, nem a composição dele;
  `editor` cria grupo e adiciona empresa que acessa, e é recusado na que não acessa;
  token com claim `client_id` é recusado no insert e apaga 0 linhas;
- as 8 RPCs continuam resolvendo quando chamadas por nome como o servidor MCP chama.
