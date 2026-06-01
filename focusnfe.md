# Focus NFe API — Documentação para Consumo por IA

> **Versão:** 2.0  
> **Fonte:** https://doc.focusnfe.com.br  
> **Finalidade:** Referência técnica completa e estruturada para uso por agentes de IA que precisam emitir, consultar e gerenciar documentos fiscais eletrônicos brasileiros via API REST.

---

## ÍNDICE

1. [Conceitos Fundamentais](#1-conceitos-fundamentais)
2. [Ambientes e URLs Base](#2-ambientes-e-urls-base)
3. [Autenticação](#3-autenticação)
4. [Referência (ref)](#4-referência-ref)
5. [Padrões de Resposta e Códigos HTTP](#5-padrões-de-resposta-e-códigos-http)
6. [Fluxos: Síncrono vs Assíncrono](#6-fluxos-síncrono-vs-assíncrono)
7. [Webhooks / Gatilhos](#7-webhooks--gatilhos)
8. [Empresas (CRUD)](#8-empresas-crud)
9. [NF-e — Nota Fiscal Eletrônica (modelo 55)](#9-nf-e--nota-fiscal-eletrônica-modelo-55)
10. [NFC-e — Nota Fiscal de Consumidor Eletrônica (modelo 65)](#10-nfc-e--nota-fiscal-de-consumidor-eletrônica-modelo-65)
11. [NFS-e — Nota Fiscal de Serviços Eletrônica (municipal)](#11-nfs-e--nota-fiscal-de-serviços-eletrônica-municipal)
12. [NFS-e Nacional (padrão SEFAZ Nacional)](#12-nfs-e-nacional-padrão-sefaz-nacional)
13. [CT-e / CT-e OS — Conhecimento de Transporte Eletrônico](#13-ct-e--ct-e-os--conhecimento-de-transporte-eletrônico)
14. [MDF-e — Manifesto de Documentos Fiscais Eletrônico](#14-mdf-e--manifesto-de-documentos-fiscais-eletrônico)
15. [NF-Com — Nota Fiscal de Comunicação](#15-nf-com--nota-fiscal-de-comunicação)
16. [DC-e — Declaração de Conteúdo Eletrônica](#16-dc-e--declaração-de-conteúdo-eletrônica)
17. [NF-Gás (Beta)](#17-nf-gás-beta)
18. [NF-e Recebidas (Manifestação do Destinatário)](#18-nf-e-recebidas-manifestação-do-destinatário)
19. [CT-e Recebidas](#19-ct-e-recebidas)
20. [NFS-e Nacional Recebidas](#20-nfs-e-nacional-recebidas)
21. [Backups](#21-backups)
22. [APIs Auxiliares (CEP, CFOP, CNAE, CNPJ, NCM, Municípios)](#22-apis-auxiliares)
23. [Emails Bloqueados](#23-emails-bloqueados)
24. [Tabelas de Referência Rápida](#24-tabelas-de-referência-rápida)

---

## 1. CONCEITOS FUNDAMENTAIS

A Focus NFe é uma API REST que abstrai toda a complexidade de comunicação com a SEFAZ (estados), prefeituras e demais órgãos competentes. O integrador envia JSON; a API faz assinatura digital, validação de schema, comunicação fiscal e devolve o resultado.

**Princípios chave para a IA:**

- Todos os requests usam `Content-Type: application/json`
- Autenticação: HTTP Basic Auth (token como usuário, senha vazia)
- Toda emissão usa um identificador único chamado `ref` (fornecido pelo integrador)
- Documentos podem ter processamento síncrono ou assíncrono (varia por tipo e configuração)
- Dois ambientes completamente separados: homologação e produção

---

## 2. AMBIENTES E URLs BASE

| Ambiente    | URL Base                              | Validade Fiscal |
| ----------- | ------------------------------------- | --------------- |
| Homologação | `https://homologacao.focusnfe.com.br` | NÃO             |
| Produção    | `https://api.focusnfe.com.br`         | SIM             |

**Prefixo de rotas:** `/v2`

**Exemplos de URL completa:**

- Homologação: `https://homologacao.focusnfe.com.br/v2/nfe`
- Produção: `https://api.focusnfe.com.br/v2/nfe`

**REGRA IMPORTANTE:** Use homologação para testes de integração. Documentos emitidos em homologação NÃO têm valor fiscal. Só mude para produção quando a integração estiver validada.

**SSL/TLS:**

- Ambos os ambientes exigem HTTPS
- Em Java, pode ser necessário importar a cadeia de certificados completa no truststore
- Para inspecionar certificados: `openssl s_client -showcerts -connect api.focusnfe.com.br:443`

---

## 3. AUTENTICAÇÃO

**Método:** HTTP Basic Authentication (RFC 7617)  
**Usuário:** Token alfanumérico da empresa (obtido no painel Focus NFe)  
**Senha:** String vazia (deixar em branco — não omitir o par ":")

**Como montar o header:**

```
Authorization: Basic BASE64(token:)
```

Note os dois pontos após o token e nenhum caractere depois deles.

**Exemplo cURL:**

```bash
curl -u 'SEU_TOKEN_AQUI:' https://homologacao.focusnfe.com.br/v2/empresas
```

**Atenção:** Cada empresa cadastrada na Focus NFe tem seu próprio `token_producao` e `token_homologacao`. Para multi-tenant (vários CNPJs), cada empresa tem tokens distintos.

---

## 4. REFERÊNCIA (ref)

A `ref` é o identificador que o integrador atribui à emissão. É o elo entre o sistema interno e o documento fiscal na Focus NFe.

**Regras:**

- Deve ser **única** dentro do escopo do token
- Formato: alfanumérico (letras e números apenas — sem acentos, espaços, `@`, `/` etc.)
- Recomendação: usar o ID interno do registro no banco de dados
- Exemplo válido: `nfe-12345`, `pedido987`, `20240115001`

**Comportamento após autorização:**

- Se a nota foi **rejeitada** (erro antes de autorizar): pode reenviar com a mesma `ref` após corrigir o payload
- Se a nota foi **autorizada** (mesmo que cancelada depois): a `ref` fica permanentemente vinculada a esse documento — não pode ser reutilizada para nova emissão

**Uso nas rotas:**

- `POST /v2/nfe?ref=MINHA_REF` → emite com a ref
- `GET /v2/nfe/MINHA_REF` → consulta pelo valor da ref
- `DELETE /v2/nfe/MINHA_REF` → cancela pelo valor da ref

---

## 5. PADRÕES DE RESPOSTA E CÓDIGOS HTTP

### Códigos HTTP retornados

| Código | Significado                                                                  |
| ------ | ---------------------------------------------------------------------------- |
| 200    | Sucesso (consulta, cancelamento, eventos)                                    |
| 201    | Documento autorizado (emissão síncrona)                                      |
| 202    | Documento em processamento (emissão assíncrona aceita)                       |
| 400    | Requisição inválida (parâmetro ausente, formato errado)                      |
| 401    | Não autenticado (token inválido ou ausente)                                  |
| 404    | Recurso não encontrado                                                       |
| 415    | Content-Type inválido (esperado application/json)                            |
| 422    | Dados semanticamente inválidos (ex: CNPJ não autorizado, nota já processada) |

### Estrutura de erro padrão

```json
{
  "codigo": "string",
  "mensagem": "string",
  "erros": [
    {
      "mensagem": "string",
      "campo": "string"
    }
  ]
}
```

### Códigos de erro mais comuns

| codigo                  | Significado                                       |
| ----------------------- | ------------------------------------------------- |
| `requisicao_invalida`   | Parâmetro obrigatório ausente ou formato inválido |
| `permissao_negada`      | CNPJ do emitente não autorizado                   |
| `pending_operation`     | Nota ainda em processamento, aguardar             |
| `already_processed`     | Nota já foi autorizada anteriormente              |
| `erro_validacao_schema` | Falha na validação do schema XML                  |
| `nao_encontrado`        | Referência não encontrada                         |
| `nfe_nao_autorizada`    | Tentativa de cancelar nota não autorizada         |
| `formato_invalido`      | Body vazio quando dados eram esperados            |

### Status de documento (campo `status`)

| status                    | Descrição                                             |
| ------------------------- | ----------------------------------------------------- |
| `processando_autorizacao` | Em fila, aguardando processamento assíncrono          |
| `autorizado`              | Autorizado pela SEFAZ/prefeitura                      |
| `cancelado`               | Cancelado com sucesso                                 |
| `erro_autorizacao`        | Rejeitado pela SEFAZ (ver `mensagem_sefaz` e `erros`) |
| `erro_cancelamento`       | Falha no cancelamento                                 |

---

## 6. FLUXOS: SÍNCRONO VS ASSÍNCRONO

### Documentos com processamento ASSÍNCRONO (padrão)

O servidor retorna HTTP 202 imediatamente confirmando recebimento. A autorização ocorre em background. É necessário consultar o status via GET ou aguardar webhook.

Documentos assíncronos: **NF-e**, **CT-e**, **MDF-e**, **NF-Com**, **DC-e**, **NF-Gás**, **NFS-e (municipal e nacional)**

**Fluxo assíncrono:**

```
POST /v2/nfe?ref=123   →  HTTP 202 + status: "processando_autorizacao"
        ↓ (aguardar)
GET  /v2/nfe/123       →  HTTP 200 + status: "autorizado" (ou "erro_autorizacao")
```

**Configuração de emissão síncrona para NF-e e MDF-e:**  
É possível ativar emissão síncrona por empresa, via campo `nfe_sincrono: true` na API de Empresas. Quando ativo, o resultado vem na mesma requisição (HTTP 201).

### Documentos com processamento SÍNCRONO

Resultado (autorização ou rejeição) retorna na mesma requisição POST.

Documentos síncronos: **NFC-e** (todos os processos), **cancelamentos em geral**, **carta de correção**, **eventos**, **encerramento MDF-e**

---

## 7. WEBHOOKS / GATILHOS

Webhooks permitem receber notificações automáticas quando um documento muda de status, evitando polling repetido.

**Como funciona:**

1. Cadastrar uma URL de destino via API de webhooks
2. Quando o evento ocorre, a Focus NFe envia um POST com o JSON do documento para sua URL
3. Sua URL deve responder com HTTP 2xx para confirmar recebimento

**Política de retentativas em caso de falha (URL indisponível ou resposta não-2xx):**

- 1ª retentativa: 1 minuto após a falha
- 2ª retentativa: 30 minutos
- 3ª retentativa: 1 hora
- 4ª retentativa: 3 horas
- 5ª retentativa: 24 horas
- Após a 5ª falha: evento **não é mais disparado** para aquela ocorrência

**Forçar reenvio manualmente:**  
Cada tipo de documento tem um endpoint para solicitar reenvio de notificação:

- NF-e: `POST /v2/nfe/{referencia}/reenviar_email` (ver seção NF-e)
- Os demais seguem padrão similar

### Endpoints de Webhooks

| Método | Rota             | Descrição                         |
| ------ | ---------------- | --------------------------------- |
| POST   | `/v2/hooks`      | Criar novo webhook                |
| GET    | `/v2/hooks`      | Listar todos os webhooks do token |
| GET    | `/v2/hooks/{id}` | Consultar webhook por ID          |
| DELETE | `/v2/hooks/{id}` | Excluir webhook                   |

---

## 8. EMPRESAS (CRUD)

**ATENÇÃO:** A API de Empresas opera **somente em produção** (`https://api.focusnfe.com.br`). Use `dry_run=1` para simular sem persistir.

### 8.1 Criar empresa

```
POST /v2/empresas
POST /v2/empresas?dry_run=1   ← simulação sem persistir
```

**Campos principais do body:**

| Campo                        | Tipo    | Obrigatório | Descrição                                                     |
| ---------------------------- | ------- | ----------- | ------------------------------------------------------------- |
| `nome`                       | string  | Sim         | Razão social                                                  |
| `nome_fantasia`              | string  | Não         | Nome fantasia                                                 |
| `cnpj`                       | string  | Sim\*       | CNPJ (só números, 14 dígitos). \*Usar cnpj OU cpf             |
| `cpf`                        | string  | Sim\*       | CPF (para empresas individuais)                               |
| `inscricao_estadual`         | integer | Não         | IE                                                            |
| `inscricao_municipal`        | integer | Não         | IM                                                            |
| `regime_tributario`          | integer | Sim         | 1=Simples Nacional, 2=Simples excesso, 3=Regime Normal, 4=MEI |
| `logradouro`                 | string  | Sim         | Endereço                                                      |
| `numero`                     | integer | Sim         | Número do endereço                                            |
| `complemento`                | string  | Não         | Complemento                                                   |
| `bairro`                     | string  | Sim         | Bairro                                                        |
| `municipio`                  | string  | Sim         | Município                                                     |
| `uf`                         | string  | Sim         | UF (ex: "SP")                                                 |
| `cep`                        | integer | Sim         | CEP                                                           |
| `telefone`                   | string  | Não         | Telefone                                                      |
| `email`                      | string  | Não         | Email de contato                                              |
| `arquivo_certificado_base64` | string  | Cond.       | Certificado digital A1 em base64 (PFX/P12)                    |
| `senha_certificado`          | string  | Cond.       | Senha do certificado (obrigatória se enviar certificado)      |

**Campos de habilitação por documento:**

| Campo                               | Tipo    | Descrição                                                                  |
| ----------------------------------- | ------- | -------------------------------------------------------------------------- |
| `habilita_nfe`                      | boolean | Habilita emissão de NF-e (modelo 55)                                       |
| `habilita_nfce`                     | boolean | Habilita emissão de NFC-e (modelo 65)                                      |
| `habilita_nfse`                     | boolean | Habilita NFS-e municipal. Não pode coexistir com `habilita_nfsen_producao` |
| `habilita_nfsen_producao`           | boolean | Habilita NFS-e Nacional em produção                                        |
| `habilita_nfsen_homologacao`        | boolean | Habilita NFS-e Nacional em homologação                                     |
| `habilita_cte`                      | boolean | Habilita CT-e/CT-e OS                                                      |
| `habilita_mdfe`                     | boolean | Habilita MDF-e                                                             |
| `habilita_nfcom`                    | boolean | Habilita NF-Com                                                            |
| `habilita_dce`                      | boolean | Habilita DC-e                                                              |
| `habilita_manifestacao`             | boolean | Habilita NF-e recebidas (MDe)                                              |
| `habilita_manifestacao_cte`         | boolean | Habilita CT-e recebidas                                                    |
| `habilita_nfsen_recebidas_producao` | boolean | Habilita NFS-e Nacional recebidas (produção)                               |

**Campos para NFC-e (obrigatórios para emitir NFC-e em produção):**

| Campo                       | Tipo    | Descrição                                                            |
| --------------------------- | ------- | -------------------------------------------------------------------- |
| `csc_nfce_producao`         | string  | CSC (Código de Segurança do Contribuinte) — obtido no SEFAZ estadual |
| `id_token_nfce_producao`    | integer | ID do CSC em produção                                                |
| `csc_nfce_homologacao`      | string  | CSC para homologação                                                 |
| `id_token_nfce_homologacao` | integer | ID do CSC em homologação                                             |

**Campos de configuração da DANFe:**

| Campo                    | Tipo    | Descrição                                           |
| ------------------------ | ------- | --------------------------------------------------- |
| `orientacao_danfe`       | string  | `portrait` ou `landscape`                           |
| `recibo_danfe`           | boolean | Exibe recibo na DANFe                               |
| `discrimina_impostos`    | boolean | Calcula impostos aproximados (Lei da Transparência) |
| `exibe_sempre_ipi_danfe` | boolean | Sempre imprime colunas IPI                          |
| `exibe_issqn_danfe`      | boolean | Mostra ISSQN na DANFe                               |
| `arquivo_logo_base64`    | string  | Logo PNG (máx 200x200px) para DANFe                 |

**Comportamento de emissão:**

| Campo                       | Tipo    | Descrição                                           |
| --------------------------- | ------- | --------------------------------------------------- |
| `nfe_sincrono`              | boolean | Emissão síncrona de NF-e em produção                |
| `nfe_sincrono_homologacao`  | boolean | Emissão síncrona de NF-e em homologação             |
| `mdfe_sincrono`             | boolean | Emissão síncrona de MDF-e                           |
| `enviar_email_destinatario` | boolean | Envia email ao destinatário após emissão (produção) |

**Resposta de sucesso (HTTP 200):**

O objeto retornado inclui todos os campos acima mais:

- `id`: ID interno da empresa na Focus NFe
- `token_producao`: Token para autenticação em produção
- `token_homologacao`: Token para autenticação em homologação
- `certificado_valido_ate`: Data de validade do certificado
- `certificado_cnpj`: CNPJ do certificado instalado

### 8.2 Listar empresas

```
GET /v2/empresas
GET /v2/empresas?page=2    ← paginação (50 por página)
```

### 8.3 Consultar empresa por ID

```
GET /v2/empresas/{id}
```

### 8.4 Atualizar empresa

```
PUT /v2/empresas/{id}
PUT /v2/empresas/{id}?dry_run=1
```

Mesmo schema do Criar. Apenas os campos enviados são atualizados.

### 8.5 Excluir empresa

```
DELETE /v2/empresas/{id}
```

**IRREVERSÍVEL.** Retorna os dados da empresa excluída.

---

## 9. NF-e — NOTA FISCAL ELETRÔNICA (modelo 55)

Documenta a circulação de mercadorias. Cobre todos os estados brasileiros.  
Processamento: **assíncrono por padrão** (pode ser configurado para síncrono).

### 9.1 Emitir NF-e

```
POST /v2/nfe?ref={ref}
```

**Campos obrigatórios do body:**

| Campo                | Tipo              | Descrição                                       |
| -------------------- | ----------------- | ----------------------------------------------- |
| `natureza_operacao`  | string            | Ex: "Venda de mercadoria", "Remessa"            |
| `data_emissao`       | string (ISO 8601) | Ex: "2024-01-15T12:00:00-03:00"                 |
| `tipo_documento`     | integer           | 0=Entrada, 1=Saída                              |
| `finalidade_emissao` | integer           | 1=Normal, 2=Complementar, 3=Ajuste, 4=Devolução |
| `items`              | array             | Lista de itens (ver abaixo)                     |

**Campos importantes do emitente:**

| Campo                         | Tipo    | Descrição                              |
| ----------------------------- | ------- | -------------------------------------- |
| `cnpj_emitente`               | string  | CNPJ do emitente (ou `cpf_emitente`)   |
| `nome_emitente`               | string  | Razão social                           |
| `logradouro_emitente`         | string  | Endereço                               |
| `numero_emitente`             | string  | Número                                 |
| `bairro_emitente`             | string  | Bairro                                 |
| `municipio_emitente`          | string  | Município                              |
| `uf_emitente`                 | string  | UF (ex: "SP")                          |
| `cep_emitente`                | string  | CEP                                    |
| `inscricao_estadual_emitente` | string  | IE                                     |
| `regime_tributario_emitente`  | integer | 1=Simples, 2=Simples excesso, 3=Normal |

**Campos importantes do destinatário:**

| Campo                                       | Tipo    | Descrição                                         |
| ------------------------------------------- | ------- | ------------------------------------------------- |
| `nome_destinatario`                         | string  | Nome ou razão social                              |
| `cnpj_destinatario`                         | string  | CNPJ (ou `cpf_destinatario`)                      |
| `email_destinatario`                        | string  | Email (para envio automático do XML)              |
| `logradouro_destinatario`                   | string  | Endereço                                          |
| `municipio_destinatario`                    | string  | Município                                         |
| `uf_destinatario`                           | string  | UF                                                |
| `cep_destinatario`                          | string  | CEP                                               |
| `indicador_inscricao_estadual_destinatario` | integer | 1=Contribuinte ICMS, 2=Isento, 9=Não Contribuinte |

**Campos de valores totais:**

| Campo                   | Tipo    | Descrição                                            |
| ----------------------- | ------- | ---------------------------------------------------- |
| `valor_total`           | float   | Valor total da nota                                  |
| `valor_produtos`        | float   | Soma dos produtos                                    |
| `valor_frete`           | float   | Valor do frete                                       |
| `valor_seguro`          | float   | Valor do seguro                                      |
| `valor_desconto`        | float   | Valor do desconto total                              |
| `valor_outras_despesas` | float   | Outras despesas                                      |
| `modalidade_frete`      | integer | 0=Emitente, 1=Destinatário, 2=Terceiros, 9=Sem frete |

**Campos opcionais de contexto:**

| Campo                | Tipo              | Descrição                                                                         |
| -------------------- | ----------------- | --------------------------------------------------------------------------------- |
| `data_entrada_saida` | string (ISO 8601) | Data de saída/entrada da mercadoria                                               |
| `local_destino`      | integer           | 1=Interna, 2=Interestadual, 3=Exterior                                            |
| `consumidor_final`   | integer           | 0=Normal, 1=Consumidor final                                                      |
| `presenca_comprador` | integer           | 0=N/A, 1=Presencial, 2=Internet, 3=Teleatendimento, 4=Entrega domicílio, 9=Outros |

**Estrutura de cada item (array `items`):**

| Campo                        | Tipo    | Obrigatório | Descrição                             |
| ---------------------------- | ------- | ----------- | ------------------------------------- |
| `numero_item`                | integer | Sim         | Sequencial a partir de 1              |
| `codigo_produto`             | string  | Sim         | Código interno do produto             |
| `descricao`                  | string  | Sim         | Descrição do produto                  |
| `cfop`                       | string  | Sim         | CFOP (ex: "5923", "5101")             |
| `quantidade_comercial`       | float   | Sim         | Quantidade                            |
| `valor_unitario_comercial`   | float   | Sim         | Valor unitário                        |
| `valor_bruto`                | float   | Sim         | Valor total do item                   |
| `codigo_ncm`                 | string  | Sim         | NCM com 8 dígitos                     |
| `unidade_comercial`          | string  | Não         | Ex: "UN", "KG", "CX"                  |
| `quantidade_tributavel`      | float   | Não         | Qtd tributável (padrão = comercial)   |
| `valor_unitario_tributavel`  | float   | Não         | Valor unit. tributável                |
| `unidade_tributavel`         | string  | Não         | Unidade tributável                    |
| `inclui_no_total`            | integer | Não         | 0=Não, 1=Sim (padrão 1)               |
| `icms_origem`                | integer | Não         | 0=Nacional, 1-7=Estrangeiro/variações |
| `icms_situacao_tributaria`   | string  | Não         | Ex: "41", "51", "00"                  |
| `pis_situacao_tributaria`    | string  | Não         | Ex: "07", "09"                        |
| `cofins_situacao_tributaria` | string  | Não         | Ex: "07", "09"                        |

**Documentação completa dos campos:** https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html

**Respostas possíveis:**

HTTP 202 (assíncrono — processamento em fila):

```json
{
  "cnpj_emitente": "12345678000123",
  "ref": "pedido-123",
  "status": "processando_autorizacao"
}
```

HTTP 201 (síncrono — autorizado na hora):

```json
{
  "cnpj_emitente": "12345678000123",
  "ref": "pedido-123",
  "status": "autorizado",
  "status_sefaz": "100",
  "mensagem_sefaz": "Autorizado o uso da NF-e",
  "chave_nfe": "NFe41190612345678000123550010000000221923094166",
  "numero": "22",
  "serie": "1",
  "caminho_xml_nota_fiscal": "/arquivos/.../XML.xml",
  "caminho_danfe": "/arquivos/.../DANFE.pdf"
}
```

### 9.2 Consultar NF-e

```
GET /v2/nfe/{referencia}
GET /v2/nfe/{referencia}?completa=1   ← inclui xml completo da requisição e protocolo
```

**Possíveis status retornados:**

`processando_autorizacao` — ainda em fila  
`autorizado` — aprovado pela SEFAZ  
`cancelado` — cancelado com sucesso  
`erro_autorizacao` — rejeitado (ver `mensagem_sefaz` e array `erros`)

**Campos adicionais quando `completa=1`:**

- `requisicao_nota_fiscal`: JSON completo com todos os dados enviados para a SEFAZ
- `protocolo_nota_fiscal`: dados do protocolo de autorização (número, data, digest)

**Exemplo de resposta de erro de autorização:**

```json
{
  "status": "erro_autorizacao",
  "status_sefaz": "598",
  "mensagem_sefaz": "Rejeição: Total da NF difere do somatório...",
  "erros": [{ "codigo": "", "mensagem": "Total da NF difere do somatório..." }]
}
```

### 9.3 Cancelar NF-e

```
DELETE /v2/nfe/{referencia}
```

**Body obrigatório:**

```json
{
  "justificativa": "Texto com 15 a 255 caracteres explicando o motivo"
}
```

**Regras:**

- Método **síncrono**
- Prazo padrão: até **24 horas** após a emissão (alguns estados permitem mais)
- Só é possível cancelar notas com status `autorizado`

**Resposta de sucesso:**

```json
{
  "status": "cancelado",
  "status_sefaz": "135",
  "mensagem_sefaz": "Evento registrado e vinculado a NF-e",
  "caminho_xml_cancelamento": "/arquivos/.../cancelamento.xml"
}
```

### 9.4 Emitir Carta de Correção (CCe)

```
POST /v2/nfe/{referencia}/carta_correcao
```

**Método síncrono.**

**O que pode ser corrigido:** dados que não afetam valor de imposto, não mudam remetente/destinatário e não alteram data de emissão/saída.

**O que NÃO pode ser corrigido:** base de cálculo, alíquota, quantidade, data de emissão, identidade das partes.

**Limite:** até 20 correções por nota. Apenas a última tem validade.

**Body:**

```json
{
  "descricao_correcao": "Texto com a correção (mínimo 15 caracteres)"
}
```

### 9.5 Outros eventos da NF-e

**Inutilizar numeração:**

```
POST /v2/nfe/inutilizacao
```

Uso excepcional. Normalmente a API controla numeração automaticamente.

**Pré-visualização DANFe (sem valor fiscal):**

```
GET /v2/nfe/{referencia}/preview_danfe
```

**Enviar NF-e por email:**

```
POST /v2/nfe/{referencia}/email
```

Body: `{"emails": ["dest@email.com", ...]}`

**Importar NF-e de XML externo:**

```
POST /v2/nfe/importar
```

**Reenviar webhook:**

```
POST /v2/nfe/{referencia}/reenviar_hook
```

**Registrar ator interessado:**

```
POST /v2/nfe/{referencia}/ator_interessado
```

Prazo: até 6 meses após autorização.

**Registrar Conciliação Financeira (ECONF):**

```
POST /v2/nfe/{referencia}/econf
DELETE /v2/nfe/{referencia}/econf/{protocolo}   ← cancelar ECONF
GET /v2/nfe/{referencia}/econf/{protocolo}       ← consultar ECONF
```

**Registrar Insucesso na Entrega:**

```
POST /v2/nfe/{referencia}/insucesso_entrega
DELETE /v2/nfe/{referencia}/insucesso_entrega    ← cancelar
```

**Consultar inutilizações:**

```
GET /v2/nfe/inutilizacoes
```

---

## 10. NFC-e — NOTA FISCAL DE CONSUMIDOR ELETRÔNICA (modelo 65)

Usada em operações de varejo com consumidor final. Todos os processos são **síncronos**.

**Pré-requisito:** empresa deve ter `csc_nfce_producao` e `id_token_nfce_producao` cadastrados (obtidos no SEFAZ estadual).

### 10.1 Emitir NFC-e

```
POST /v2/nfce?ref={ref}
```

Mesmo schema básico da NF-e, adaptado para consumidor final. A numeração pode ser controlada automaticamente pela API ou definida manualmente via campos `numero` e `serie`.

**Contingência offline:**

```
POST /v2/nfce?ref={ref}&forma_emissao=offline
```

Requer `habilita_contingencia_offline_nfce: true` na empresa.

**Resposta (síncrona — HTTP 200 ou 201):**

```json
{
  "status": "autorizado",
  "chave_nfe": "...",
  "numero": "...",
  "serie": "...",
  "caminho_xml_nota_fiscal": "...",
  "caminho_danfce": "...",
  "qrcode_url": "..."
}
```

### 10.2 Consultar NFC-e

```
GET /v2/nfce/{referencia}
```

### 10.3 Cancelar NFC-e

```
DELETE /v2/nfce/{referencia}
```

Prazo: até **30 minutos** após a emissão.

### 10.4 Inutilizar numeração NFC-e

```
POST /v2/nfce/inutilizacao
```

### 10.5 Enviar NFC-e por email

```
POST /v2/nfce/{referencia}/email
```

Limite: 10 emails por requisição.

### 10.6 ECONF (Conciliação Financeira)

```
POST /v2/nfce/{referencia}/econf               ← registrar
DELETE /v2/nfce/{referencia}/econf/{protocolo} ← cancelar
GET /v2/nfce/{referencia}/econf/{protocolo}    ← consultar
```

**Cancelamento:** deve seguir a ordem cronológica (do mais antigo ao mais recente).

### 10.7 Consultar inutilizações NFC-e

```
GET /v2/nfce/inutilizacoes
```

---

## 11. NFS-e — NOTA FISCAL DE SERVIÇOS ELETRÔNICA (municipal)

Emitida por prestadores de serviço. Integração com webservices de prefeituras. Processamento **assíncrono**.

**Verificar municípios suportados:** https://focusnfe.com.br/guides/nfse/municipios-integrados/

**ATENÇÃO — Reforma Tributária:** Muitos municípios estão migrando para o padrão NFS-e Nacional. Verificar guia em: https://focusnfe.com.br/guides/reforma-tributaria/

### 11.1 Emitir NFS-e

```
POST /v2/nfse?ref={ref}
```

**Campos principais:**

| Campo                                 | Tipo         | Descrição                             |
| ------------------------------------- | ------------ | ------------------------------------- |
| `data_emissao`                        | string (ISO) | Data e hora da emissão                |
| `prestador_cnpj`                      | string       | CNPJ do prestador                     |
| `prestador_inscricao_municipal`       | string       | IM do prestador                       |
| `tomador_cnpj`                        | string       | CNPJ do tomador (ou CPF)              |
| `tomador_nome`                        | string       | Nome/razão social do tomador          |
| `tomador_email`                       | string       | Email para envio                      |
| `servico_valor_servicos`              | float        | Valor dos serviços                    |
| `servico_descricao`                   | string       | Descrição do serviço prestado         |
| `servico_codigo_tributario_municipio` | string       | Código tributário municipal           |
| `servico_item_lista_servico`          | string       | Item da lista LC 116/2003             |
| `servico_discriminacao`               | string       | Discriminação detalhada do serviço    |
| `servico_municipio_prestacao_servico` | string       | Município onde o serviço foi prestado |

### 11.2 Consultar NFS-e

```
GET /v2/nfse/{referencia}
```

### 11.3 Cancelar NFS-e

```
DELETE /v2/nfse/{referencia}
```

**Atenção:** algumas prefeituras não suportam cancelamento via webservice. Consulte a lista de municípios.

**Body:**

```json
{
  "codigo_cancelamento": "1",
  "justificativa": "Motivo do cancelamento"
}
```

### 11.4 Reenviar email NFS-e

```
POST /v2/nfse/{referencia}/enviar_email
```

### 11.5 Reenviar webhook NFS-e

```
POST /v2/nfse/{referencia}/reenviar_hook
```

---

## 12. NFS-e NACIONAL (padrão SEFAZ Nacional)

Padrão unificado nacional de NFS-e, baseado em DPS (Documento Pessoal de Serviços). Processamento **assíncrono**.

**Documentação de campos:** https://campos.focusnfe.com.br/nfse_nacional/EmissaoDPSXml.html

### 12.1 Emitir NFS-e Nacional

```
POST /v2/nfsen?ref={ref}
```

### 12.2 Consultar NFS-e Nacional

```
GET /v2/nfsen/{referencia}
```

### 12.3 Cancelar NFS-e Nacional

```
DELETE /v2/nfsen/{referencia}
```

### 12.4 Reenviar webhook

```
POST /v2/nfsen/{referencia}/reenviar_hook
```

---

## 13. CT-e / CT-e OS — CONHECIMENTO DE TRANSPORTE ELETRÔNICO

Documenta a prestação de serviço de transporte. Cobre todos os estados. Processamento **assíncrono**.

**CT-e OS** (Outros Serviços): processamento **síncrono**.

**Documentação completa de campos CT-e:** https://campos.focusnfe.com.br/cte_cteos/ConhecimentoTransporteXML.html  
**Documentação completa de campos CT-e OS:** https://focusnfe.com.br/doc/#cte-e-cte-os_campos-de-um-cte

### 13.1 Emitir CT-e

```
POST /v2/cte?ref={ref}
```

O CT-e exige um **modal** (forma de transporte). Campos variam por modal:

| Modal       | URL de campos                                                          |
| ----------- | ---------------------------------------------------------------------- |
| Rodoviário  | https://campos.focusnfe.com.br/cte_cteos/TransporteRodoviarioXML.html  |
| Aéreo       | https://campos.focusnfe.com.br/cte_cteos/TransporteAereoXML.html       |
| Aquaviário  | https://campos.focusnfe.com.br/cte_cteos/TransporteAquaviarioXML.html  |
| Ferroviário | https://campos.focusnfe.com.br/cte_cteos/TransporteFerroviarioXML.html |
| Dutoviário  | https://campos.focusnfe.com.br/cte_cteos/TransporteDutoviarioXML.html  |
| Multimodal  | https://campos.focusnfe.com.br/cte_cteos/TransporteMultimodalXML.html  |

### 13.2 Emitir CT-e OS

```
POST /v2/cteos?ref={ref}
```

**Síncrono.** Modal rodoviário: incluir quando aplicável. Demais modais: não obrigatório.

### 13.3 Consultar CT-e / CT-e OS

```
GET /v2/cte/{referencia}
GET /v2/cteos/{referencia}
```

### 13.4 Cancelar CT-e / CT-e OS

```
DELETE /v2/cte/{referencia}
DELETE /v2/cteos/{referencia}
```

**Síncrono.** Apenas documentos com status `autorizado`.

**Body:**

```json
{
  "justificativa": "Motivo do cancelamento (mínimo 15 caracteres)"
}
```

### 13.5 Carta de Correção (CT-e)

```
POST /v2/cte/{referencia}/carta_correcao
```

**Síncrono.** Obrigatório informar qual campo será alterado. Limite: 20 correções. Até 20 correções diferentes, mas apenas a última é válida.

### 13.6 Reenviar webhook CT-e

```
POST /v2/cte/{referencia}/reenviar_hook
```

---

## 14. MDF-e — MANIFESTO DE DOCUMENTOS FISCAIS ELETRÔNICO

Agrupa CT-es e NF-es em um manifesto para operações de transporte. Processamento **assíncrono** (configurável para síncrono).

**Documentação completa de campos:** https://campos.focusnfe.com.br/mdfe/MDFeXML.html

### 14.1 Emitir MDF-e

```
POST /v2/mdfe?ref={ref}
```

Requer modal de transporte:

| Modal       | URL de campos                                                     |
| ----------- | ----------------------------------------------------------------- |
| Rodoviário  | https://campos.focusnfe.com.br/mdfe/TransporteRodoviarioXML.html  |
| Aéreo       | https://campos.focusnfe.com.br/mdfe/TransporteAereoXML.html       |
| Aquaviário  | https://campos.focusnfe.com.br/mdfe/TransporteAquaviarioXML.html  |
| Ferroviário | https://campos.focusnfe.com.br/mdfe/TransporteFerroviarioXML.html |

### 14.2 Consultar MDF-e

```
GET /v2/mdfe/{referencia}
```

### 14.3 Cancelar MDF-e

```
DELETE /v2/mdfe/{referencia}
```

**Síncrono.** Apenas status `autorizado`. Definitivo e irreversível.

### 14.4 Encerrar MDF-e

```
POST /v2/mdfe/{referencia}/encerramento
```

**Síncrono.** Obrigatório após conclusão da operação de transporte.

**Diferença entre encerrar e cancelar:**

- **Encerrar**: a operação foi concluída com sucesso
- **Cancelar**: a operação foi interrompida antes de iniciar

### 14.5 Incluir condutor

```
POST /v2/mdfe/{referencia}/condutor
```

**Síncrono.** Adiciona condutor adicional ao MDF-e autorizado.

### 14.6 Incluir DF-e (documento fiscal eletrônico)

```
POST /v2/mdfe/{referencia}/dfe
```

**Síncrono.** Para MDF-e com indicativo de carregamento posterior.

### 14.7 Reenviar webhook MDF-e

```
POST /v2/mdfe/{referencia}/reenviar_hook
```

---

## 15. NF-Com — NOTA FISCAL DE COMUNICAÇÃO

Para prestadores de serviços de telecomunicação. Processamento **assíncrono**.

**Documentação completa de campos:** https://campos.focusnfe.com.br/nfcom/NotaFiscalComunicacaoXML.html

### Endpoints NF-Com

| Método | Rota                                   | Descrição           |
| ------ | -------------------------------------- | ------------------- |
| POST   | `/v2/nfcom?ref={ref}`                  | Emitir              |
| GET    | `/v2/nfcom/{referencia}`               | Consultar           |
| DELETE | `/v2/nfcom/{referencia}`               | Cancelar (síncrono) |
| POST   | `/v2/nfcom/{referencia}/reenviar_hook` | Reenviar webhook    |

---

## 16. DC-e — DECLARAÇÃO DE CONTEÚDO ELETRÔNICA

Para declarar conteúdo de encomendas (ECT/Correios). Processamento **assíncrono**.

**Documentação completa de campos:** https://campos.focusnfe.com.br/dce/DeclaracaoConteudoXML.html

### Endpoints DC-e

| Método | Rota                                 | Descrição           |
| ------ | ------------------------------------ | ------------------- |
| POST   | `/v2/dce?ref={ref}`                  | Emitir              |
| GET    | `/v2/dce/{referencia}`               | Consultar           |
| DELETE | `/v2/dce/{referencia}`               | Cancelar (síncrono) |
| POST   | `/v2/dce/{referencia}/reenviar_hook` | Reenviar webhook    |

---

## 17. NF-Gás (Beta)

Para distribuidores de gás natural. Processamento **assíncrono**.

**Documentação completa de campos:** https://campos.focusnfe.com.br/nfgas/NotaFiscalGasXML.html

### Endpoints NF-Gás

| Método | Rota                                   | Descrição           |
| ------ | -------------------------------------- | ------------------- |
| POST   | `/v2/nfgas?ref={ref}`                  | Emitir              |
| GET    | `/v2/nfgas/{referencia}`               | Consultar           |
| DELETE | `/v2/nfgas/{referencia}`               | Cancelar (síncrono) |
| POST   | `/v2/nfgas/{referencia}/reenviar_hook` | Reenviar webhook    |

---

## 18. NF-e RECEBIDAS (Manifestação do Destinatário)

Quando terceiros emitem NF-e contra o CNPJ da empresa. A Focus NFe monitora a Receita Federal e disponibiliza esses documentos.

**Pré-requisito:** `habilita_manifestacao: true` na empresa.

**Conceito de `versao`:** campo único por CNPJ que incrementa a cada alteração no documento. Permite buscar apenas documentos novos ou atualizados. Armazene sempre o maior `versao` recebido.

### 18.1 Consultar NF-es recebidas (lista)

```
GET /v2/nfes_recebidas?versao={versao}&cnpj_destinatario={cnpj}
```

**Retorna até 100 registros por vez.** Para paginar, use o `versao` máximo retornado no header `X-Max-Version` como parâmetro da próxima requisição.

**Headers de resposta úteis:**

- `X-Total-Count`: total de registros encontrados
- `X-Max-Version`: versão máxima dos documentos retornados nesta página

**Fluxo de sincronização recomendado:**

1. Armazene `ultima_versao_sincronizada` (inicialmente 0)
2. `GET /v2/nfes_recebidas?versao={ultima_versao_sincronizada}`
3. Processe os documentos
4. Atualize `ultima_versao_sincronizada` com o valor de `X-Max-Version`
5. Repita enquanto houver documentos

### 18.2 Consultar NF-e recebida individual (por chave)

```
GET /v2/nfes_recebidas/{chave_acesso}
```

**Formatos alternativos:**

```
GET /v2/nfes_recebidas/{chave_acesso}.json    ← JSON completo
GET /v2/nfes_recebidas/{chave_acesso}.xml     ← XML da nota
GET /v2/nfes_recebidas/{chave_acesso}.pdf     ← DANFe (redirect 302 para URL do PDF)
GET /v2/nfes_recebidas/{chave_acesso}/cancelamento.xml      ← XML de cancelamento
GET /v2/nfes_recebidas/{chave_acesso}/carta_correcao.xml    ← XML da última CCe
```

**ATENÇÃO sobre download do DANFe (PDF):**  
A rota retorna HTTP 302 com a URL real no header `Location`. Se sua biblioteca não segue redirecionamentos, leia o header `Location` e faça um GET nessa URL **sem** o header `Authorization` da Focus NFe.

### 18.3 Manifestar NF-e recebida

```
POST /v2/nfes_recebidas/{chave_acesso}/manifesto
```

**Síncrono.**

**Tipos de manifestação:**

| tipo_evento                | Código | Descrição                                     |
| -------------------------- | ------ | --------------------------------------------- |
| `ciencia_operacao`         | 210210 | Operação conhecida, mas sem confirmação ainda |
| `desconhecimento_operacao` | 210220 | Empresa não reconhece a nota                  |
| `confirmacao_operacao`     | 210200 | Operação confirmada e realizada               |
| `operacao_nao_realizada`   | 210240 | Operação não foi realizada                    |

**Body:**

```json
{
  "tipo_evento": "confirmacao_operacao",
  "justificativa": "Mercadorias recebidas conforme pedido"
}
```

### 18.4 Cancelar evento de NF-e recebida

```
DELETE /v2/nfes_recebidas/{chave_acesso}/evento/{id_evento}
```

### 18.5 Reenviar webhook NF-e recebida

```
POST /v2/nfes_recebidas/{chave_acesso}/reenviar_hook
```

---

## 19. CT-e RECEBIDAS

Monitoramento de CT-es emitidos contra o CNPJ da empresa.

**Pré-requisito:** `habilita_manifestacao_cte: true` na empresa.

**Mesmo conceito de `versao`** das NF-es recebidas.

### 19.1 Consultar CT-es recebidos (lista)

```
GET /v2/ctes_recebidos?versao={versao}&cnpj_destinatario={cnpj}
```

**Retorna até 100 registros.** Paginar via `X-Max-Version`.

### 19.2 Consultar CT-e recebido individual

```
GET /v2/ctes_recebidos/{chave_acesso}
GET /v2/ctes_recebidos/{chave_acesso}.json
GET /v2/ctes_recebidos/{chave_acesso}.xml
GET /v2/ctes_recebidos/{chave_acesso}.pdf     ← DACTe
GET /v2/ctes_recebidos/{chave_acesso}/cancelamento.xml
GET /v2/ctes_recebidos/{chave_acesso}/carta_correcao.xml
```

### 19.3 Informar desacordo de CT-e

```
POST /v2/ctes_recebidos/{chave_acesso}/desacordo
```

**Síncrono.**

**ATENÇÃO:** Tomador/destinatário pessoa física (CPF) **não pode** registrar desacordo via webservice — deve ser feito pela plataforma gov.br.

### 19.4 Consultar desacordo

```
GET /v2/ctes_recebidos/{chave_acesso}/desacordo
```

### 19.5 Reenviar webhook CT-e recebida

```
POST /v2/ctes_recebidos/{chave_acesso}/reenviar_hook
```

---

## 20. NFS-e NACIONAL RECEBIDAS

Monitoramento de NFS-e nacionais emitidas contra o CNPJ da empresa.

**Pré-requisito:** `habilita_nfsen_recebidas_producao: true` (requer certificado digital com CNPJ idêntico).

**Mesmo conceito de `versao`** dos demais recebidos.

### 20.1 Consultar NFS-e nacionais recebidas (lista)

```
GET /v2/nfsen_recebidas?versao={versao}
```

Retorna até 100 registros. Paginar via `X-Max-Version`.

### 20.2 Consultar NFS-e nacional recebida individual

```
GET /v2/nfsen_recebidas/{chave_acesso}
GET /v2/nfsen_recebidas/{chave_acesso}.json
GET /v2/nfsen_recebidas/{chave_acesso}.xml
GET /v2/nfsen_recebidas/{chave_acesso}.pdf
GET /v2/nfsen_recebidas/{chave_acesso}.html    ← DANFSe em HTML (padrão nacional)
```

### 20.3 Reenviar webhook NFS-e nacional recebida

```
POST /v2/nfsen_recebidas/{chave_acesso}/reenviar_hook
```

---

## 21. BACKUPS

Arquivos de backup mensal com XMLs e DANFes de documentos emitidos.

**Documentos cobertos:** NF-e, NFC-e, NF-Com, CT-e, MDF-e.

### 21.1 Consultar backups disponíveis por CNPJ

```
GET /v2/backups?cnpj={cnpj}
```

**Resposta:**  
Lista de arquivos mensais disponíveis, cada item com caminhos para:

- ZIP de DANFEs (PDF) das NF-es
- ZIP de XMLs de todos os documentos

---

## 22. APIs AUXILIARES

APIs de consulta de tabelas fiscais brasileiras. Úteis para validação de dados antes da emissão.

### 22.1 CEP

```
GET /v2/ceps/{cep}                    ← Consulta CEP específico (8 dígitos, só números)
GET /v2/ceps?codigo_ibge=&logradouro=&localidade=&uf=    ← Busca por parâmetros
```

**Para busca:** informar pelo menos 2 parâmetros. Exceção: municípios com CEP único aceitam apenas `codigo_ibge`.

### 22.2 CFOP (Código Fiscal de Operações)

```
GET /v2/cfop/{codigo}                 ← Código exato
GET /v2/cfop?codigo=&descricao=&offset=    ← Busca. Retorna 50 por vez.
```

### 22.3 CNAE (Classificação Nacional de Atividades Econômicas)

```
GET /v2/cnae/{codigo}                 ← Código exato
GET /v2/cnae?descricao=&offset=       ← Busca. Retorna 50 por vez.
```

### 22.4 CNPJ (Cadastro Nacional de Pessoa Jurídica)

```
GET /v2/cnpj/{cnpj}                   ← 14 dígitos, só números
```

Retorna dados cadastrais da empresa na Receita Federal.

### 22.5 Municípios

```
GET /v2/municipios/{codigo_ibge}                   ← Código IBGE (7 dígitos)
GET /v2/municipios?uf=&nome=&offset=               ← Filtro e paginação
GET /v2/municipios/{codigo_ibge}/codigos_tributarios    ← Códigos tributários do município
GET /v2/municipios/{codigo_ibge}/lista_servicos         ← Itens da lista LC116
GET /v2/municipios/{codigo_ibge}/codigos_tributarios/{codigo}   ← Código tributário específico
GET /v2/municipios/{codigo_ibge}/lista_servicos/{codigo}        ← Item da lista específico
```

### 22.6 NCM (Nomenclatura Comum do Mercosul)

```
GET /v2/ncm/{codigo}                  ← Código exato
GET /v2/ncm?codigo=&descricao=&capitulo=&posicao=&offset=    ← Busca. Retorna 50 por vez.
```

**Parâmetros de busca NCM:**

- `codigo`: parte inicial do código
- `descricao`: parte da descrição
- `capitulo`, `posicao`, `subposicao1`, `subposicao2`, `item1`, `item2`: partes exatas do código

---

## 23. EMAILS BLOQUEADOS

Gerenciamento de endereços de email que não devem receber comunicações.

```
GET /v2/emails_bloqueados/{email}        ← Verificar se está bloqueado
DELETE /v2/emails_bloqueados/{email}     ← Solicitar desbloqueio
```

**Atenção:** nem todos os bloqueios podem ser removidos (ex: reclamações de spam são permanentes).

---

## 24. TABELAS DE REFERÊNCIA RÁPIDA

### 24.1 Mapa completo de endpoints por documento

| Documento      | Emitir             | Consultar          | Cancelar              | Carta Correção                     | Reenviar Hook                     |
| -------------- | ------------------ | ------------------ | --------------------- | ---------------------------------- | --------------------------------- |
| NF-e           | `POST /nfe?ref=`   | `GET /nfe/{ref}`   | `DELETE /nfe/{ref}`   | `POST /nfe/{ref}/carta_correcao`   | `POST /nfe/{ref}/reenviar_hook`   |
| NFC-e          | `POST /nfce?ref=`  | `GET /nfce/{ref}`  | `DELETE /nfce/{ref}`  | N/A                                | N/A                               |
| NFS-e          | `POST /nfse?ref=`  | `GET /nfse/{ref}`  | `DELETE /nfse/{ref}`  | N/A                                | `POST /nfse/{ref}/reenviar_hook`  |
| NFS-e Nacional | `POST /nfsen?ref=` | `GET /nfsen/{ref}` | `DELETE /nfsen/{ref}` | N/A                                | `POST /nfsen/{ref}/reenviar_hook` |
| CT-e           | `POST /cte?ref=`   | `GET /cte/{ref}`   | `DELETE /cte/{ref}`   | `POST /cte/{ref}/carta_correcao`   | `POST /cte/{ref}/reenviar_hook`   |
| CT-e OS        | `POST /cteos?ref=` | `GET /cteos/{ref}` | `DELETE /cteos/{ref}` | `POST /cteos/{ref}/carta_correcao` | `POST /cteos/{ref}/reenviar_hook` |
| MDF-e          | `POST /mdfe?ref=`  | `GET /mdfe/{ref}`  | `DELETE /mdfe/{ref}`  | N/A                                | `POST /mdfe/{ref}/reenviar_hook`  |
| NF-Com         | `POST /nfcom?ref=` | `GET /nfcom/{ref}` | `DELETE /nfcom/{ref}` | N/A                                | `POST /nfcom/{ref}/reenviar_hook` |
| DC-e           | `POST /dce?ref=`   | `GET /dce/{ref}`   | `DELETE /dce/{ref}`   | N/A                                | `POST /dce/{ref}/reenviar_hook`   |
| NF-Gás         | `POST /nfgas?ref=` | `GET /nfgas/{ref}` | `DELETE /nfgas/{ref}` | N/A                                | `POST /nfgas/{ref}/reenviar_hook` |

### 24.2 Fluxo de processamento por documento

| Documento       | Emissão                                       | Cancelamento |
| --------------- | --------------------------------------------- | ------------ |
| NF-e            | Assíncrono (padrão) / Síncrono (configurável) | Síncrono     |
| NFC-e           | Síncrono                                      | Síncrono     |
| NFS-e municipal | Assíncrono                                    | Síncrono     |
| NFS-e Nacional  | Assíncrono                                    | Síncrono     |
| CT-e            | Assíncrono                                    | Síncrono     |
| CT-e OS         | Síncrono                                      | Síncrono     |
| MDF-e           | Assíncrono (padrão) / Síncrono (configurável) | Síncrono     |
| NF-Com          | Assíncrono                                    | Síncrono     |
| DC-e            | Assíncrono                                    | Síncrono     |
| NF-Gás          | Assíncrono                                    | Síncrono     |

### 24.3 Tipos de documento (tipo_documento) — NF-e

| Valor | Significado            |
| ----- | ---------------------- |
| 0     | Nota Fiscal de Entrada |
| 1     | Nota Fiscal de Saída   |

### 24.4 Finalidade de emissão — NF-e

| Valor | Significado    |
| ----- | -------------- |
| 1     | Normal         |
| 2     | Complementar   |
| 3     | Nota de ajuste |
| 4     | Devolução      |

### 24.5 Regime tributário

| Valor | Significado                             |
| ----- | --------------------------------------- |
| 1     | Simples Nacional                        |
| 2     | Simples Nacional — excesso de sublimite |
| 3     | Regime Normal (Lucro Real/Presumido)    |
| 4     | MEI (Simples Nacional — MEI)            |

### 24.6 Modalidade de frete — NF-e

| Valor | Significado                     |
| ----- | ------------------------------- |
| 0     | Por conta do emitente (CIF)     |
| 1     | Por conta do destinatário (FOB) |
| 2     | Por conta de terceiros          |
| 9     | Sem frete                       |

### 24.7 Indicador IE do destinatário

| Valor | Significado                                 |
| ----- | ------------------------------------------- |
| 1     | Contribuinte ICMS                           |
| 2     | Contribuinte isento                         |
| 9     | Não contribuinte (pessoa física ou simples) |

### 24.8 Origem ICMS do produto

| Valor | Significado                                        |
| ----- | -------------------------------------------------- |
| 0     | Nacional                                           |
| 1     | Estrangeiro — importação direta                    |
| 2     | Estrangeiro — adquirido no mercado interno         |
| 3     | Nacional com > 40% conteúdo estrangeiro            |
| 4     | Nacional — processos produtivos básicos            |
| 5     | Nacional com < 40% conteúdo estrangeiro            |
| 6     | Estrangeiro (import. direta) sem similar nacional  |
| 7     | Estrangeiro (mercado interno) sem similar nacional |

### 24.9 Local de destino da operação

| Valor | Significado            |
| ----- | ---------------------- |
| 1     | Operação interna       |
| 2     | Operação interestadual |
| 3     | Operação com exterior  |

### 24.10 Presença do comprador

| Valor | Significado                    |
| ----- | ------------------------------ |
| 0     | Não se aplica                  |
| 1     | Operação presencial            |
| 2     | Pela internet                  |
| 3     | Teleatendimento                |
| 4     | NFC-e com entrega em domicílio |
| 9     | Outros (não presencial)        |

---

## DECISÕES DE DESIGN IMPORTANTES PARA IA

### Quando usar NF-e vs NFC-e

- **NF-e (modelo 55):** operações entre empresas (B2B), remessas, devoluções, operações interestaduais
- **NFC-e (modelo 65):** venda direta ao consumidor final no varejo (PDV físico ou e-commerce direto)

### Quando usar NFS-e vs NFS-e Nacional

- **NFS-e municipal:** prefeitura do município tem sistema próprio integrado à Focus NFe
- **NFS-e Nacional:** município migrou para o padrão SEFAZ Nacional (lista crescente com a Reforma Tributária)
- **Regra:** verificar status do município em https://focusnfe.com.br/guides/reforma-tributaria/
- **Conflito:** as duas habilitações são mutuamente exclusivas em produção

### Como lidar com emissão assíncrona

1. Enviar POST → guardar status `processando_autorizacao`
2. Aguardar webhook OU fazer polling com GET (intervalo recomendado: 3-5 segundos, máx 30 tentativas)
3. Status `autorizado`: salvar `chave_nfe`, `numero`, `serie`, caminhos XML/DANFe
4. Status `erro_autorizacao`: ler `mensagem_sefaz` e `erros` para diagnóstico

### Boas práticas de ref

- Use o ID primário do pedido/nota no seu banco de dados
- Jamais reutilize uma ref de nota autorizada
- Se precisar reemitir após erro: pode reusar a mesma ref (não foi autorizada)

### Download de XMLs e PDFs

- URLs retornadas nos campos `caminho_xml_nota_fiscal`, `caminho_danfe` etc. são caminhos relativos à URL base
- Para download: `GET {URL_BASE}{caminho}` com o mesmo header de autenticação
- Para DANFe de NF-e recebida: seguir redirect 302 **sem** enviar o header Authorization para a URL de destino

### Contato e suporte

- Email: suporte@focusnfe.com.br
- Guides: https://focusnfe.com.br/guides
- Campos completos: https://campos.focusnfe.com.br

---

_Documentação gerada em 01/06/2026. Fonte: https://doc.focusnfe.com.br — versão 2.0_
