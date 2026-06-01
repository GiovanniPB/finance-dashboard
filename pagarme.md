# Pagar.me API v5 — Referência consolidada (otimizada para LLMs)

> **Propósito deste documento.** Reúne, em um único arquivo Markdown, as convenções, recursos, campos, exemplos de requisição/resposta, enums de status e eventos de webhook da **API Pagar.me v5 (2021-09-01)**. Foi escrito para ser ingerido por modelos de linguagem que precisam gerar código de integração ou responder perguntas sobre a API sem ambiguidade.
>
> **Fonte.** Compilado a partir da documentação oficial em `https://docs.pagar.me/reference` (índice para agentes em `https://docs.pagar.me/llms.txt`). Quando um detalhe não estava explícito na fonte consultada, isso é sinalizado. Sempre valide contra a documentação oficial antes de ir para produção.
>
> **Como ler.** Cada recurso segue o mesmo padrão: método + caminho, parâmetros de path, tabela de campos do corpo (nome · tipo · obrigatório · descrição), exemplo de request JSON, exemplo de response JSON e notas/armadilhas.

---

## Índice

1. [Convenções globais](#1-convencoes-globais)
2. [Autenticação e segurança](#2-autenticacao-e-seguranca)
3. [Erros e validação](#3-erros-e-validacao)
4. [Rate limits](#4-rate-limits)
5. [Prefixos de ID](#5-prefixos-de-id)
6. [Modelo de domínio](#6-modelo-de-dominio)
7. [Clientes (customers)](#7-clientes-customers)
8. [Cartões (cards)](#8-cartoes-cards)
9. [Pedidos (orders)](#9-pedidos-orders)
10. [Meios de pagamento](#10-meios-de-pagamento)
11. [Split de pagamentos e recebedores](#11-split-de-pagamentos-e-recebedores)
12. [Cobranças (charges)](#12-cobrancas-charges)
13. [Planos (plans)](#13-planos-plans)
14. [Assinaturas (subscriptions)](#14-assinaturas-subscriptions)
15. [Transferências, antecipações e saldo](#15-transferencias-antecipacoes-e-saldo)
16. [Links de pagamento / Checkout](#16-links-de-pagamento--checkout)
17. [Webhooks](#17-webhooks)
18. [Tabela de referência de status (enums)](#18-tabela-de-referencia-de-status-enums)
19. [Receitas de integração](#19-receitas-de-integracao)
20. [Índice de endpoints e páginas oficiais](#20-indice-de-endpoints-e-paginas-oficiais)
21. [Glossário](#21-glossario)

---

## 1. Convenções globais

| Item                                  | Valor                                                                                                                                  |
| :------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------- |
| **Base URL (produção e sandbox)**     | `https://api.pagar.me/core/v5`                                                                                                         |
| **Versão**                            | v5 (data de versão `2021-09-01`)                                                                                                       |
| **Protocolo**                         | HTTPS obrigatório (TLS 1.2 / TLS 1.3)                                                                                                  |
| **Formato de corpo**                  | `application/json` em requisições e respostas                                                                                          |
| **Codificação de valores monetários** | **Inteiro em centavos** (ex.: `R$ 14,90` → `1490`). Nunca use decimais para `amount`.                                                  |
| **Moeda**                             | `BRL`                                                                                                                                  |
| **Datas/horários**                    | ISO 8601 em UTC, formato `YYYY-MM-DDThh:mm:ssZ`                                                                                        |
| **Ambiente de teste**                 | Sandbox usa as **chaves de teste** da própria conta; a base URL é a mesma. A separação entre teste e produção é dada pela chave usada. |

### Regras transversais (aplicam-se a vários recursos)

- **Valores em centavos.** Todo campo `amount`, `price`, `minimum_price`, etc. é inteiro em centavos e deve ser maior que zero quando aplicável.
- **E-mail do cliente é único.** Criar um `customer` com e-mail já existente **atualiza** o cliente anterior em vez de criar um novo.
- **Não trafegue dados de cartão abertos** se você não for PCI Compliant. Prefira `card_id` (clientes PSP) ou `card_token` (clientes Gateway).
- **CVV em recorrência.** Em transações recorrentes, o CVV só deve ser enviado na primeira cobrança (`recurrence_cycle = first`).
- **Dados do comprador.** Em um pedido, informe `customer_id` **ou** o objeto `customer` completo — pelo menos um é obrigatório. Para clientes **PSP**, todos os campos do `customer` (incluindo endereço e telefone) são obrigatórios.
- **Paginação (endpoints de listagem).** Os endpoints `GET` de coleção aceitam, no padrão da API, os query params `page` (página, começa em 1) e `size` (itens por página). A resposta vem em `{ "data": [...], "paging": {...} }`. _Confirme limites e nomes na página do endpoint específico._

---

## 2. Autenticação e segurança

A API usa **HTTP Basic Auth**. No esquema OpenAPI: `securitySchemes.sec0 = { type: http, scheme: basic }`.

- **Usuário:** sua **Secret Key** (chave secreta da conta — `sk_test_...` em teste, `sk_...` em produção).
- **Senha:** vazia.

Ou seja, o header é `Authorization: Basic base64(<secret_key>:)` — note os dois-pontos com senha vazia.

```bash
# Exemplo cURL — criar um cliente
curl -X POST https://api.pagar.me/core/v5/customers \
  -u "sk_test_SUA_CHAVE:" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Tony Stark", "email": "tony@avengers.com" }'
```

```javascript
// Exemplo Node (fetch) — Basic Auth com senha vazia
const auth = "Basic " + Buffer.from("sk_test_SUA_CHAVE:").toString("base64");
const res = await fetch("https://api.pagar.me/core/v5/customers", {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Tony Stark", email: "tony@avengers.com" }),
});
```

### PCI / rede / TLS

- Empresa **PCI Compliant**. Libere o domínio **`api.pagar.me`** no seu ambiente. Caso precise liberar por IP, os blocos publicados incluem: `52.7.218.15/32`, `54.221.195.0/32`, `18.97.14.112/29`, `18.97.16.32/28`, `18.97.30.136/29`, `18.97.137.160/28`, `18.97.138.24/29`, `52.186.34.80/28`, `104.45.183.192/28`, `52.160.136.0/28`, `13.88.79.144/28`.
- **Protocolos aceitos:** TLS 1.2 e TLS 1.3 (recomendado 1.3).
- **Hashes:** SHA256, SHA384, SHA512. **Cipher suites:** ≥ 128 bits.
- Certificados SSL são provisionados automaticamente com validade de ~90 dias. **Não faça pinning de certificado.** Sempre envie requisições para o FQDN dos endpoints.

---

## 3. Erros e validação

A API retorna códigos HTTP convencionais. Os principais:

| HTTP  | Significado          | Quando ocorre                                                                                                            |
| :---- | :------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `200` | OK                   | Operação bem-sucedida (inclusive criação).                                                                               |
| `400` | Bad Request          | Requisição malformada.                                                                                                   |
| `404` | Not Found            | Recurso inexistente (ex.: `{"message": "Customer not found."}`).                                                         |
| `412` | Precondition Failed  | Ex.: falha na verificação de cartão (Zero Dollar Auth) → `"Could not create credit card. The card verification failed."` |
| `422` | Unprocessable Entity | Erro de validação de campos.                                                                                             |

### Formato do erro de validação (422)

```json
{
  "message": "The request is invalid.",
  "errors": {
    "customer.name": ["The name field is required."]
  },
  "request": {
    "email": "tonystarkk@avengers.com",
    "...": "...eco da requisição enviada..."
  }
}
```

- `message`: descrição geral.
- `errors`: mapa `campo → lista de mensagens`. A chave usa caminho com ponto (ex.: `plan.name`, `card`).
- `request`: eco do corpo recebido, útil para debug.

---

## 4. Rate limits

Limites máximos de requisições **por minuto** por endpoint (produção):

| Endpoint                     | Método | Limite/min                                                                                |
| :--------------------------- | :----- | :---------------------------------------------------------------------------------------- |
| `/charges`                   | GET    | 200                                                                                       |
| `/charges/*`                 | GET    | 200                                                                                       |
| `/charges/{charge_id}` (PIX) | DELETE | Após a 10ª tentativa de cancelar a **mesma** cobrança PIX, 1 nova tentativa a cada 15 min |
| `/orders`                    | GET    | 200                                                                                       |
| `/orders/*`                  | GET    | 200                                                                                       |
| `/recipients`                | GET    | 100                                                                                       |
| `/recipients/*`              | GET    | 150                                                                                       |
| `/subscriptions`             | GET    | 200                                                                                       |
| `/subscriptions/*`           | GET    | 200                                                                                       |
| `/invoices`                  | GET    | 200                                                                                       |
| `/invoices/*`                | GET    | 200                                                                                       |
| `/customers`                 | GET    | 200                                                                                       |
| `/customers/*`               | GET    | 200                                                                                       |
| `/hooks`                     | GET    | 50                                                                                        |
| `/hooks/*`                   | GET    | 50                                                                                        |
| `/payables`                  | GET    | 700                                                                                       |
| `/balance/operations`        | GET    | 300                                                                                       |

> **Sandbox (contas de teste):** 10 requisições por segundo para qualquer endpoint.

---

## 5. Prefixos de ID

Todo recurso tem um `id` com prefixo identificável. Use isto para inferir o tipo de objeto a partir de um ID solto.

| Prefixo       | Recurso                       | Exemplo                                               |
| :------------ | :---------------------------- | :---------------------------------------------------- |
| `cus_`        | Cliente (customer)            | `cus_QA5V47r9c0Im3dzN`                                |
| `card_`       | Cartão                        | `card_8ELY0AwVF9HDa3jK`                               |
| `addr_`       | Endereço                      | `addr_KewjagEfrCbY1doZ`                               |
| `or_`         | Pedido (order)                | `or_56GXnk6T0eU88qMm`                                 |
| `ch_`         | Cobrança (charge)             | `ch_NW0ABG5HQikn3Lv4`                                 |
| `tran_`       | Transação (transaction)       | `tran_1lLxVjc3JCXVxnED`                               |
| `oi_`         | Item de pedido (order item)   | `oi_6rXqKEzuZYcRo2zL`                                 |
| `plan_`       | Plano                         | `plan_0z5Jd4dFk3t9Jo4m`                               |
| `pi_`         | Item de plano (plan item)     | `pi_d97LMgRCmOFdWREe`                                 |
| `sub_`        | Assinatura (subscription)     | `sub_05jkdIfGYPfN26mI`                                |
| `si_`         | Item de assinatura / desconto | `si_B6555Riyq9lj6klS`                                 |
| `cycle_`      | Ciclo de assinatura           | `cycle_j6WnJ7ei1hW68bXo`                              |
| `rp_` / `re_` | Recebedor (recipient)         | `rp_5yGwpMGckBHVYmb6`, `re_clxnqkxk709sc019taqhmj4kf` |
| `ba_`         | Conta bancária (bank account) | `ba_LlpvMnqcXSO2EVW8`                                 |
| `sr_`         | Regra de split (split rule)   | `sr_1qeQrB3s1synMW45`                                 |
| `hook_`       | Webhook (entrega/evento)      | `hook_...`                                            |

---

## 6. Modelo de domínio

Hierarquia central de pagamento:

```
Order (or_)
 ├── items[]            (oi_)   itens vendidos
 ├── customer           (cus_)  comprador
 ├── shipping                   dados de entrega (opcional)
 └── charges[]          (ch_)   uma cobrança por pagamento
       └── last_transaction (tran_)  tentativa de processamento mais recente
             └── card (card_) | boleto | pix | ...
             └── split[] (sr_) → recipient (rp_/re_)
```

Recorrência:

```
Plan (plan_)  ── template de cobrança recorrente
   └── items[] (pi_) + pricing_scheme
Subscription (sub_) ── recorrência ativa de um cliente
   ├── plan (opcional; ou assinatura "avulsa" sem plano)
   ├── customer (cus_) + card (card_)
   ├── current_cycle (cycle_) + next_billing_at
   ├── items[] (si_), discounts[] (si_), increments[]
   └── gera invoices → charges a cada ciclo
```

Marketplace / split:

```
Recipient (rp_/re_) ── quem recebe parte da venda
   ├── default_bank_account (ba_)
   ├── transfer_settings
   └── automatic_anticipation_settings
Order/Charge.payments[].split[] ── divide o valor entre recebedores
```

**Conceitos-chave:**

- Um **pedido (order)** agrega itens, comprador e um ou mais **pagamentos**. Cada pagamento gera uma **cobrança (charge)**.
- Uma **cobrança** tem um histórico de **transações**; `last_transaction` é a tentativa mais recente.
- Pedido pode ser criado **fechado** (`closed: true`, padrão) ou **aberto** (`closed: false`) para receber cobranças adicionais antes de fechar.

---

## 7. Clientes (customers)

### 7.1 Criar cliente

`POST /customers`

| Campo           | Tipo          | Obrigatório | Descrição                                                                       |
| :-------------- | :------------ | :---------- | :------------------------------------------------------------------------------ |
| `name`          | string        | sim\*       | Nome. Máx. 64 caracteres. (\*Obrigatório no objeto.)                            |
| `email`         | string        | não         | E-mail. Máx. 64. **Único** — reenviar atualiza o cliente existente.             |
| `code`          | string        | não         | Referência no seu sistema. Máx. 52.                                             |
| `document`      | string        | não         | CPF/CNPJ (máx. 16) ou PASSPORT (máx. 50).                                       |
| `document_type` | string        | não         | `CPF`, `CNPJ` ou `PASSPORT`.                                                    |
| `type`          | string        | condicional | `individual` (PF) ou `company` (PJ). **Obrigatório se `document` for enviado.** |
| `gender`        | string        | não         | `male` ou `female`.                                                             |
| `address`       | object        | não         | Endereço (ver abaixo).                                                          |
| `phones`        | object        | não         | `home_phone` e/ou `mobile_phone`.                                               |
| `birthdate`     | string (date) | não         | Data de nascimento.                                                             |
| `metadata`      | object        | não         | Pares chave/valor livres.                                                       |

**Objeto `address`:** `country` (ISO 3166-1 alpha-2, 2 dígitos), `state` (ISO 3166-2), `city`, `zip_code` (só números), `line_1` (Número, Rua, Bairro — nesta ordem, separados por vírgula), `line_2` (complemento/referências).

**Objeto `phones.{home_phone|mobile_phone}`:** `country_code`, `area_code`, `number` (todos só números).

```json
// Request
{
  "name": "Tony Stark",
  "email": "tonystarkk@avengers.com",
  "code": "MY_CUSTOMER_001",
  "document": "93095135270",
  "type": "individual",
  "document_type": "CPF",
  "gender": "male",
  "address": {
    "line_1": "375, Av. General Justo, Centro",
    "line_2": "8º andar",
    "zip_code": "20021130",
    "city": "Rio de Janeiro",
    "state": "RJ",
    "country": "BR"
  },
  "birthdate": "05/03/1984",
  "phones": {
    "home_phone": { "country_code": "55", "area_code": "21", "number": "000000000" },
    "mobile_phone": { "country_code": "55", "area_code": "21", "number": "000000000" }
  },
  "metadata": { "company": "Avengers" }
}
```

```json
// Response 200 (campos adicionais devolvidos pela API)
{
  "id": "cus_QA5V47r9c0Im3dzN",
  "name": "Tony Stark",
  "email": "tonystarkk@avengers.com",
  "document": "93095135270",
  "document_type": "CPF",
  "type": "individual",
  "delinquent": false,
  "address": { "id": "addr_KewjagEfrCbY1doZ", "status": "active", "...": "..." },
  "created_at": "2017-09-22T15:36:46Z",
  "updated_at": "2018-04-03T17:46:20Z",
  "phones": { "...": "..." },
  "metadata": { "company": "Avengers" }
}
```

### 7.2 Endereço do cliente

`POST /customers/{customer_id}/addresses` — cria um `address` associado ao cliente (informe `customer_id` no path). Mesma estrutura de `address` acima.

> Cliente com `document_type = PASSPORT` na integração Sub Pagar.me só transaciona com endereços internacionais (reconhecidos pelo ZIP code do país).

---

## 8. Cartões (cards)

O objeto `card` descreve um cartão (crédito, voucher ou private label) associado a um `customer`. O conjunto de cartões de um cliente forma a **Wallet**.

### 8.1 Criar cartão

`POST /customers/{customer_id}/cards`

| Campo                | Tipo    | Obrigatório | Descrição                                                                                                                                     |
| :------------------- | :------ | :---------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| `number`             | string  | sim         | Número do cartão, 13–19 caracteres.                                                                                                           |
| `holder_name`        | string  | sim         | Nome impresso. Máx. 64. Sem números/caracteres especiais.                                                                                     |
| `holder_document`    | string  | condicional | CPF/CNPJ do portador. **Obrigatório para voucher (VR/Pluxee).**                                                                               |
| `exp_month`          | integer | sim         | Mês de validade 1–12.                                                                                                                         |
| `exp_year`           | integer | sim         | Ano de validade (`yy` ou `yyyy`).                                                                                                             |
| `cvv`                | string  | sim         | 3 ou 4 dígitos conforme bandeira.                                                                                                             |
| `brand`              | string  | condicional | `elo`, `mastercard`, `visa`, `amex`, `jcb`, `aura`, `hipercard`, `diners`, `unionpay`, `discover`. **Obrigatório se `private_label = true`.** |
| `label`              | string  | não         | Label do cartão.                                                                                                                              |
| `billing_address`    | object  | não         | Endereço de cobrança (`line_1`, `line_2`, `zip_code`, `city`, `state`, `country`).                                                            |
| `billing_address_id` | string  | não         | Alternativa ao `billing_address`. Máx. 36.                                                                                                    |
| `options`            | object  | não         | Ex.: `{ "verify_card": true }` para Zero Dollar Auth.                                                                                         |
| `metadata`           | object  | não         | Pares chave/valor.                                                                                                                            |
| `token`              | string  | não         | Token de cartão previamente tokenizado (no lugar dos dados abertos).                                                                          |

```json
// Request
{
  "number": "4000000000000010",
  "holder_name": "Tony Stark",
  "holder_document": "93095135270",
  "exp_month": 1,
  "exp_year": 30,
  "cvv": "351",
  "brand": "Mastercard",
  "billing_address": {
    "line_1": "375, Av. General Osorio, Centro",
    "line_2": "7º Andar",
    "zip_code": "220000111",
    "city": "Rio de Janeiro",
    "state": "RJ",
    "country": "BR"
  },
  "options": { "verify_card": true }
}
```

```json
// Response 200 (resumo)
{
  "id": "card_8ELY0AwVF9HDa3jK",
  "first_six_digits": "542501",
  "last_four_digits": "7793",
  "brand": "Mastercard",
  "holder_name": "Tony Stark",
  "exp_month": 1,
  "exp_year": 2030,
  "status": "active",
  "type": "credit",
  "billing_address": { "...": "..." },
  "customer": { "id": "cus_yoqONwOJI1IBNbjl", "...": "..." }
}
```

**Notas:**

- Cadastrar o **mesmo cartão** duas vezes retorna o `card_id` já existente.
- Com `network_token` (tokenização de bandeira), a resposta inclui `network_token.token_unique_reference` e `network_token.status`.
- Outros endpoints: `POST /tokens` (criar token de cartão — checkout transparente), `PUT /customers/{customer_id}/cards/{card_id}` (editar cartão).

---

## 9. Pedidos (orders)

O pedido é o objeto central de transação (disponível para clientes Gateway e PSP).

### 9.1 Criar pedido

`POST /orders`

**Campos de topo:**

| Campo         | Tipo    | Obrigatório | Descrição                                                                         |
| :------------ | :------ | :---------- | :-------------------------------------------------------------------------------- |
| `items`       | array   | **sim**     | Itens do pedido (ver abaixo).                                                     |
| `payments`    | array   | **sim**     | Lista de pagamentos (ver §10).                                                    |
| `customer_id` | string  | condicional | Código do cliente. Obrigatório se `customer` ausente.                             |
| `customer`    | object  | condicional | Dados do cliente (mesma estrutura de §7). Obrigatório se `customer_id` ausente.   |
| `shipping`    | object  | não         | Entrega: `amount`, `description`, `recipient_name`, `recipient_phone`, `address`. |
| `closed`      | boolean | não         | `true` (padrão) cria fechado; `false` permite adicionar cobranças depois.         |
| `code`        | string  | não         | Código do pedido no seu sistema. Máx. 52.                                         |
| `metadata`    | object  | não         | Pares chave/valor.                                                                |

**`items[]`:** `amount` (int, centavos, > 0), `description` (string), `quantity` (int), `code` (string — **obrigatório por item**).

```json
// Request mínimo — cartão de crédito
{
  "items": [
    { "amount": 100, "description": "Chaveiro do Tesseract", "quantity": 1, "code": "12345" }
  ],
  "customer": { "name": "Tony Stark", "email": "tony@avengers.com" },
  "payments": [
    {
      "payment_method": "credit_card",
      "credit_card": {
        "installments": 1,
        "statement_descriptor": "AVENGERS",
        "card": {
          "number": "4000000000000010",
          "holder_name": "Tony Stark",
          "exp_month": 1,
          "exp_year": 30,
          "cvv": "351",
          "billing_address": {
            "line_1": "10880, Malibu Point, Malibu Central",
            "zip_code": "90265",
            "city": "Malibu",
            "state": "CA",
            "country": "US"
          }
        }
      }
    }
  ]
}
```

```json
// Response 200 (resumo — o pedido devolve charges[] com last_transaction)
{
  "id": "ch_NW0ABG5HQikn3Lv4",
  "code": "487FO9HYV3",
  "amount": 100,
  "paid_amount": 100,
  "status": "paid",
  "currency": "BRL",
  "payment_method": "credit_card",
  "customer": { "id": "cus_dgLJ8jmURSe0DQ0N", "...": "..." },
  "last_transaction": {
    "id": "tran_1lLxVjc3JCXVxnED",
    "transaction_type": "credit_card",
    "status": "captured",
    "success": true,
    "installments": 1,
    "operation_type": "auth_and_capture",
    "card": {
      "id": "card_nKojDZnNIjh9D5z1",
      "brand": "Visa",
      "last_four_digits": "5580",
      "...": "..."
    },
    "gateway_response": { "code": "200" }
  },
  "metadata": { "code": "123" }
}
```

### 9.2 Incluir cobrança em pedido aberto

Enquanto um pedido está **aberto** (`closed: false`), adicione novas cobranças usando o `order_id` na criação da cobrança. Quando o pedido for fechado, dispara o evento `order.closed`.

---

## 10. Meios de pagamento

Cada item de `payments[]` tem `payment_method` e um objeto homônimo com os detalhes. Valores possíveis de `payment_method`: `credit_card`, `debit_card`, `boleto`, `pix`, `voucher`, `private_label`, e Google Pay.

### 10.1 Cartão de crédito (`credit_card`)

| Campo                  | Tipo    | Descrição                                                                                                 |
| :--------------------- | :------ | :-------------------------------------------------------------------------------------------------------- |
| `operation_type`       | string  | `auth_and_capture` (captura imediata), `auth_only` (autoriza), `pre_auth` (pré-autoriza).                 |
| `installments`         | integer | Parcelas. **Deve ser 1 em recorrência.**                                                                  |
| `statement_descriptor` | string  | Texto na fatura. Máx. 22 (Gateway) / 13 (PSP).                                                            |
| `card`                 | object  | Dados do cartão (`number`, `holder_name`, `exp_month`, `exp_year`, `cvv`, `brand`, `billing_address`...). |
| `card_id`              | string  | ID de cartão salvo (recomendado para PSP).                                                                |
| `card_token`           | string  | Token do checkout transparente (Gateway).                                                                 |
| `network_token`        | object  | Token de bandeira: `number`, `holder_name`, `exp_month`, `exp_year`, `cryptograms` (base64).              |
| `recurrence_cycle`     | string  | `first` ou `subsequent` (recorrência externa).                                                            |
| `recurrence_model`     | string  | `standing_order`, `instalment`, `subscription`.                                                           |
| `initiated_type`       | string  | `partial_shipment`, `related_or_delayed_charge`, `no_show`, `retry`.                                      |
| `payment_origin`       | object  | `charge_id` + `brand_id` (1ª cobrança de uma recorrência).                                                |

> Use **um** entre `card`, `card_id`, `card_token` ou `network_token`.

### 10.2 Cartão de débito (`debit_card`)

Mesma estrutura de cartão (`card`/`card_id`/`card_token`/`network_token`) + `statement_descriptor` (máx. 22). Suporta `initiated_type` e `recurrence_model`. Em geral exige autenticação 3DS.

### 10.3 Boleto (`boleto`)

| Campo                  | Tipo     | Descrição                                                                                                                                           |
| :--------------------- | :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bank`                 | string   | `001` BB, `033` Santander, `104` Caixa, `197` Banco Stone, `237` Bradesco, `341` Itaú, `745` Citibank. (Opcional — usa prioridade pré-configurada.) |
| `instructions`         | string   | Instruções. Máx. 256.                                                                                                                               |
| `due_at`               | datetime | Vencimento (opcional).                                                                                                                              |
| `nosso_numero`         | string   | Identificador único do boleto na conta.                                                                                                             |
| `type`                 | string   | `DM` (Duplicata Mercantil) ou `BDP` (Boleto de Proposta).                                                                                           |
| `document_number`      | string   | Identificador. Máx. 16.                                                                                                                             |
| `statement_descriptor` | string   | Texto na fatura. Máx. 13 (opcional).                                                                                                                |
| `interest`             | object   | Juros: `days`, `type` (`flat`/`percentage`), `amount`. **Só PSP.**                                                                                  |
| `fine`                 | object   | Multa: `days`, `type` (`flat`/`percentage`), `amount`. **Só PSP.**                                                                                  |
| `discount`             | object   | Desconto por antecipação (exclusivo PSP): `type` + `rules[]` (`limit_date`, `amount`).                                                              |

> **`amount` de juros/multa:** com `type: flat` é inteiro em centavos (≥ 1, cobrado diariamente); com `type: percentage` é 0–100 e aceita decimal (ex.: `1.5` = 1,5%, cobrado mensalmente).
> **Boleto com registro:** `customer.name`, `customer.address` e `customer.document` são **obrigatórios**.
> **Cancelamento (Gateway):** não gera estorno financeiro, apenas muda o status da charge.

A resposta inclui no `last_transaction`: `url`, `pdf`, `line` (linha digitável), `barcode`, `qr_code`, `nosso_numero`, `due_at`. Boletos ficam acessíveis até **60 dias** após o vencimento.

### 10.4 Pix (`pix`)

| Campo                    | Tipo     | Descrição                                                     |
| :----------------------- | :------- | :------------------------------------------------------------ |
| `expires_in`             | integer  | Expiração em **segundos** (mandatório — ou use `expires_at`). |
| `expires_at`             | datetime | Expiração absoluta (`YYYY-MM-DDThh:mm:ss`). Máx. 10 anos.     |
| `additional_information` | array    | Pares `{ "name", "value" }` exibidos ao pagador.              |

> Pix exige `customer` com `name`, `email`, `document` e `phones`.
> Só disponível para contas com gateway Pagar.me. Suporta **Split** para afiliação Pagar.me.
> **Estorno:** envie cancelamento da cobrança (`charge_id`).

A resposta (`last_transaction`) traz `qr_code` (copia-e-cola EMV), `qr_code_url` (imagem PNG), `expires_at`; após pagamento inclui `end_to_end_id` e `payer` (`name`, `document`, `bank_account`).

```json
// Request Pix (pedido)
{
  "items": [{ "amount": 2990, "description": "Item", "quantity": 1 }],
  "customer": {
    "name": "Tony Stark",
    "email": "tony@avengers.com",
    "type": "individual",
    "document": "01234567890",
    "phones": { "home_phone": { "country_code": "55", "area_code": "21", "number": "22180513" } }
  },
  "payments": [
    {
      "payment_method": "pix",
      "pix": {
        "expires_in": 3600,
        "additional_information": [{ "name": "Quantidade", "value": "2" }]
      }
    }
  ]
}
```

### 10.5 Voucher (`voucher`) e Private Label (`private_label`)

- **Voucher:** bandeiras Alelo, Ticket, VR, Pluxee. Exige `card.holder_document` para VR/Pluxee.
- **Private Label:** cartão de marca própria; `brand` é obrigatório.

### 10.6 Google Pay

Pagamento via token criptografado do Google Pay dentro de `payments[]`. Ver página oficial `google-paytm-api`.

---

## 11. Split de pagamentos e recebedores

### 11.1 O objeto `split` (dentro de `payments[]`)

| Campo                           | Tipo    | Descrição                                         |
| :------------------------------ | :------ | :------------------------------------------------ |
| `recipient_id`                  | string  | Recebedor (`rp_...`).                             |
| `amount`                        | integer | Valor destinado (centavos ou %, conforme `type`). |
| `type`                          | string  | `flat` (centavos) ou `percentage`.                |
| `options.charge_processing_fee` | boolean | Recebedor arca com as taxas de processamento.     |
| `options.charge_remainder_fee`  | boolean | Recebedor recebe o restante após divisão.         |
| `options.liable`                | boolean | Recebedor é responsável em caso de chargeback.    |

```json
"split": [
  { "amount": 50, "recipient_id": "rp_5yGwpMGckBHVYmb6", "type": "percentage",
    "options": { "charge_processing_fee": true, "charge_remainder_fee": true, "liable": true } },
  { "amount": 50, "recipient_id": "rp_yLnAyVpHbQIqZxwO", "type": "percentage",
    "options": { "charge_processing_fee": false, "charge_remainder_fee": false, "liable": false } }
]
```

> Para fazer split, cadastre os recebedores **antes**. Cada recebedor é criado uma única vez e reutilizado em qualquer quantidade de pedidos. Ex.: marketplace com 2 lojas → 3 recebedores (marketplace + loja 1 + loja 2).

### 11.2 Criar recebedor

`POST /recipients`

Obrigatórios no topo: `register_information` e `default_bank_account`.

**`register_information` (PF — `type: individual`):** `name`, `email`, `document` (CPF), `type`, `mother_name`, `birthdate`, `monthly_income`, `professional_occupation`, `address` (`street`, `complementary`, `street_number`, `neighborhood`, `city`, `state`, `zip_code`, `reference_point`), `phone_numbers[]` (`ddd`, `number`, `type`), `site_url`.

**`register_information` (PJ — `type: corporation`):** `email`, `document` (CNPJ), `type`, `company_name`, `trading_name`, `annual_revenue`, `corporation_type`, `founding_date`, `main_address`, `phone_numbers[]`, e `managing_partners[]` (representante legal: `name`, `email`, `document`, `birthdate`, `monthly_income`, `professional_occupation`, `self_declared_legal_representative`, `address`, `phone_numbers`).

**`default_bank_account`:** `holder_name`, `holder_type` (`individual`/`company`), `holder_document` (= documento do recebedor), `bank`, `branch_number`, `branch_check_digit`, `account_number` (≤ 13 dígitos), `account_check_digit`, `type` (`checking`/`savings`).

**`transfer_settings`:** `transfer_enabled` (bool), `transfer_interval` (`Daily`/`Weekly`/`Monthly`), `transfer_day` (int).

**`automatic_anticipation_settings`:** `enabled` (bool), `type` (`full`/`1025`), `volume_percentage`, `days[]`, `delay`.

```json
// Request — recebedor PF (resumo)
{
  "code": "1234",
  "register_information": {
    "name": "Recebedor PF",
    "email": "rec@x.com",
    "document": "26224451990",
    "type": "individual",
    "mother_name": "Nome da mae",
    "birthdate": "12/10/1995",
    "monthly_income": 120000,
    "professional_occupation": "Vendedor",
    "address": {
      "street": "Av. General Justo",
      "street_number": "375",
      "complementary": "Bloco A",
      "neighborhood": "Centro",
      "city": "Rio de Janeiro",
      "state": "RJ",
      "zip_code": "20021130",
      "reference_point": "Ao lado da banca"
    },
    "phone_numbers": [{ "ddd": "21", "number": "994647568", "type": "mobile" }]
  },
  "default_bank_account": {
    "holder_name": "Tony Stark",
    "holder_type": "individual",
    "holder_document": "26224451990",
    "bank": "341",
    "branch_number": "1234",
    "branch_check_digit": "6",
    "account_number": "12345",
    "account_check_digit": "6",
    "type": "checking"
  },
  "transfer_settings": {
    "transfer_enabled": false,
    "transfer_interval": "Daily",
    "transfer_day": 0
  }
}
```

> **Contrato de recebedores (Circular 3.978/20 do BC):** desde fev/2024 é obrigatório enviar dados cadastrais mínimos dos sellers de marketplace. A resposta inclui `id` (`re_...`), `status`, `default_bank_account.id` (`ba_...`), `gateway_recipients[]` e `payment_mode`.

**Outros endpoints de recebedor:** `GET /recipients/{id}` (obter), `PUT /recipients/{id}` (editar), `PATCH /recipients/{id}/default-bank-account`, `PATCH /recipients/{id}/transfer-settings`, `PATCH /recipients/{id}/code`, criar link de Prova de Vida (KYC).

---

## 12. Cobranças (charges)

A `charge` representa a tentativa de pagamento de um valor. Pertence a um `order` (ou é criada avulsa/recorrente) e mantém `last_transaction`.

### 12.1 Obter cobrança

`GET /charges/{charge_id}`

Campos principais da resposta: `id` (`ch_...`), `code`, `amount`, `paid_amount`, `status`, `currency`, `payment_method`, `paid_at`, `created_at`, `updated_at`, `customer`, `order` (quando há), `last_transaction`, `metadata`.

```json
// Response 200 (resumo, cartão capturado)
{
  "id": "ch_6NXoYXyiNfP3A54l",
  "code": "ABCDE123",
  "amount": 1490,
  "paid_amount": 1490,
  "status": "paid",
  "payment_method": "credit_card",
  "paid_at": "2019-01-22T14:31:36Z",
  "last_transaction": {
    "id": "tran_QGXDnycJdHKnoVa3",
    "transaction_type": "credit_card",
    "status": "captured",
    "success": true,
    "acquirer_return_code": "00",
    "acquirer_message": "Transação capturada com sucesso",
    "operation_type": "capture",
    "card": { "id": "card_jdK2O53TqfnxwRDY", "brand": "Visa", "last_four_digits": "0010" },
    "gateway_response": { "code": "200", "errors": [] }
  }
}
```

### 12.2 Outras operações de cobrança

| Operação                   | Método e caminho                            | Notas                                                                                        |
| :------------------------- | :------------------------------------------ | :------------------------------------------------------------------------------------------- |
| Capturar                   | `POST /charges/{charge_id}/capture`         | Captura uma charge previamente autorizada (`auth_only`/`pre_auth`); aceita `amount` parcial. |
| Cancelar / estornar        | `DELETE /charges/{charge_id}`               | Cancela/estorna; para Pix dispara estorno. (Rate limit especial em Pix.)                     |
| Editar método de pagamento | `PATCH /charges/{charge_id}/payment-method` | Troca o meio de pagamento da cobrança.                                                       |
| Editar cartão da cobrança  | `PATCH /charges/{charge_id}/card`           | Só quando a transação **não** foi autorizada.                                                |
| Listar                     | `GET /charges`                              | Suporta filtros e paginação.                                                                 |

> Campos úteis em `last_transaction` para conciliação/antifraude: `acquirer_name`, `acquirer_tid`, `acquirer_nsu`, `acquirer_auth_code`, `acquirer_return_code`, `gateway_response`, `antifraud_response`, `entry_mode`, `funding_source`.

---

## 13. Planos (plans)

Template reutilizável para criar assinaturas.

### 13.1 Criar plano

`POST /plans`

| Campo                  | Tipo       | Obrigatório | Descrição                                                                                 |
| :--------------------- | :--------- | :---------- | :---------------------------------------------------------------------------------------- |
| `name`                 | string     | **sim**     | Nome. Máx. 64.                                                                            |
| `description`          | string     | não         | Descrição.                                                                                |
| `shippable`            | boolean    | não         | Indica entrega.                                                                           |
| `payment_methods`      | array      | não         | `credit_card`, `boleto`, `debit_card`. Padrão: `credit_card`.                             |
| `installments`         | array(int) | não         | Parcelas disponíveis. Em recorrência, 1.                                                  |
| `minimum_price`        | integer    | não         | Valor mínimo da fatura (centavos).                                                        |
| `statement_descriptor` | string     | não         | Texto na fatura. Máx. 13.                                                                 |
| `currency`             | string     | não         | `BRL`.                                                                                    |
| `interval`             | string     | não         | `day`, `week`, `month` (padrão), `year`.                                                  |
| `interval_count`       | integer    | não         | Nº de intervalos entre cobranças (mensal=1/month, trimestral=3/month, semestral=6/month). |
| `trial_period_days`    | integer    | não         | Dias de teste.                                                                            |
| `billing_type`         | string     | não         | `prepaid`, `postpaid`, `exact_day`.                                                       |
| `billing_days`         | array(int) | condicional | 1–28. **Obrigatório se `billing_type = exact_day`.**                                      |
| `items`                | array      | não         | Itens com `pricing_scheme`.                                                               |
| `pricing_scheme`       | object     | condicional | Obrigatório na ausência de `items`.                                                       |
| `quantity`             | integer    | condicional | Obrigatório quando `pricing_scheme.scheme_type = unit`.                                   |
| `metadata`             | object     | não         | Pares chave/valor.                                                                        |

**`pricing_scheme`:** `scheme_type` (`unit` padrão, `package`, `volume`, `tier`), `price` (para `unit`), `minimum_price`, `price_brackets[]` (`start_quantity`, `end_quantity`, `overage_price`, `price` — para `package`/`volume`/`tier`).

```json
// Request
{
  "name": "Plano Gold",
  "currency": "BRL",
  "interval": "month",
  "interval_count": 3,
  "billing_type": "prepaid",
  "minimum_price": 10000,
  "installments": [3],
  "payment_methods": ["credit_card", "boleto"],
  "items": [
    { "name": "Musculação", "quantity": 1, "pricing_scheme": { "price": 18990 } },
    { "name": "Matrícula", "cycles": 1, "quantity": 1, "pricing_scheme": { "price": 5990 } }
  ],
  "metadata": { "id": "my_plan_id" }
}
```

```json
// Response 200 (resumo) — id "plan_...", status "active", items[] com id "pi_..."
{
  "id": "plan_0z5Jd4dFk3t9Jo4m",
  "name": "Plano Gold",
  "minimum_price": 10000,
  "interval": "month",
  "interval_count": 3,
  "billing_type": "prepaid",
  "payment_methods": ["credit_card", "boleto"],
  "installments": [3],
  "status": "active",
  "currency": "BRL",
  "items": [
    {
      "id": "pi_d97LMgRCmOFdWREe",
      "name": "Musculação",
      "pricing_scheme": { "price": 18990, "scheme_type": "unit" }
    }
  ]
}
```

`PUT /plans/{plan_id}` edita o plano.

---

## 14. Assinaturas (subscriptions)

Recorrência ativa. Pode ser criada **a partir de um plano** ou **avulsa** (sem plano).

### 14.1 Criar assinatura de plano

`POST /subscriptions`

| Campo             | Tipo         | Obrigatório | Descrição                                                |
| :---------------- | :----------- | :---------- | :------------------------------------------------------- |
| `plan_id`         | string       | **sim**     | `plan_...`.                                              |
| `payment_method`  | string       | **sim**     | `credit_card`, `boleto`, `debit_card`.                   |
| `customer_id`     | string       | condicional | Obrigatório se `customer` ausente.                       |
| `customer`        | object       | condicional | Obrigatório se `customer_id` ausente.                    |
| `card`            | object       | condicional | Obrigatório para cartão (ou use `card_id`/`card_token`). |
| `start_at`        | string(date) | não         | Início; se ausente, começa imediatamente.                |
| `installments`    | integer      | não         | Parcelas (1 em recorrência).                             |
| `discounts`       | array        | não         | `{ cycles, value, discount_type (flat/percentage) }`.    |
| `increments`      | array        | não         | `{ value, cycles, increment_type (flat/percentage) }`.   |
| `boleto_due_days` | integer      | não         | Dias para expirar o boleto.                              |
| `code`            | string       | não         | Código no seu sistema. Máx. 52.                          |
| `metadata`        | object       | não         | Pares chave/valor.                                       |

```json
// Request (cartão)
{
  "plan_id": "plan_21r4CTG0ux77Qv13",
  "payment_method": "credit_card",
  "customer": { "name": "Tony Stark", "email": "tony@avengers.com" },
  "card": {
    "holder_name": "Tony Stark",
    "number": "4532464862385322",
    "exp_month": 1,
    "exp_year": 30,
    "cvv": "903",
    "billing_address": {
      "line_1": "375, Av. General Justo, Centro",
      "zip_code": "20021130",
      "city": "Rio de Janeiro",
      "state": "RJ",
      "country": "BR"
    }
  },
  "discounts": [{ "cycles": 3, "value": 10, "discount_type": "percentage" }]
}
```

```json
// Response 200 (resumo) — id "sub_...", current_cycle (cycle_...), next_billing_at
{
  "id": "sub_05jkdIfGYPfN26mI",
  "payment_method": "credit_card",
  "currency": "BRL",
  "interval": "month",
  "interval_count": 3,
  "billing_type": "prepaid",
  "current_cycle": { "start_at": "2016-07-19T00:00:00Z", "end_at": "2016-10-18T23:59:59Z" },
  "next_billing_at": "2016-10-19T00:00:00Z",
  "installments": 3,
  "status": "active",
  "customer": { "id": "cus_017228NmffGbA3d4", "...": "..." },
  "card": { "id": "card_Mome2meGz4PDNQbX", "masked_number": "453246******5322", "...": "..." },
  "plan": { "id": "plan_21r4CTG0ux77Qv13", "...": "..." },
  "items": [{ "id": "si_B6555Riyq9lj6klS", "...": "..." }]
}
```

### 14.2 Assinatura avulsa e ciclos

- **Avulsa:** `POST /subscriptions` sem `plan_id`, definindo `items`/`pricing_scheme`, `interval`, `interval_count`, `billing_type` diretamente.
- **Renovar ciclo:** `POST /subscriptions/{subscription_id}/cycles` renova o ciclo à frente.
- **Listar ciclos:** `GET /subscriptions/{subscription_id}/cycles`.
- **Cancelar:** `DELETE /subscriptions/{subscription_id}` (dispara `subscription.canceled`).
- A cada ciclo a assinatura gera uma **invoice** que origina uma **charge**.

---

## 15. Transferências, antecipações e saldo

Recursos financeiros para recebedores/marketplace (resumo — ver páginas oficiais para schema completo).

### Transferências (transfers)

- `POST /recipients/{id}/withdrawals` ou rota de transferência: realiza transferência para conta bancária previamente cadastrada.
- `GET .../transfers` lista; `GET .../transfers/{id}` obtém; cancelar só com status `pending_transfer`.
- Comprovante só disponível para transferências com status `transferred`.

### Antecipações (anticipations)

- Criar antecipação; obter limites (máx/mín) de antecipação de um recebedor; listar; **simular antecipação Spot** (prevê valor a receber, custos e data de pagamento).
- Cancelar antecipação só enquanto status = `pending` (criada e ainda não confirmada).

### Saldo e recebíveis

- **Operações de saldo (`/balance/operations`):** movimentações do saldo disponível (pagamentos, saques).
- **Recebíveis (`/payables`):** retorna os recebíveis da loja.
- **Settlements (pagamentos por recebedor):** `GET` lista pagamentos (settlements) de um recebedor ordenados por data (mais recentes no topo).

### Disputas / chargeback

- `GET /disputes` lista disputas (paginado); `GET /disputes/{dispute_id}` consulta uma; `POST /disputes/{dispute_id}/evidences` envia evidência de defesa (1 PDF ≤ 2 MB, ≤ 10 páginas).

### Res. 264/349 (contratos UR)

- Endpoints para retornar contratos, efeitos de contratos, contestações, contestar contrato e retornar URs (Unidades de Recebíveis) de um recebedor.

---

## 16. Links de pagamento / Checkout

O **Link de pagamento Pagar.me** oferece uma página de checkout hospedada pela Pagar.me.

| Operação                  | Caminho                       | Notas                                        |
| :------------------------ | :---------------------------- | :------------------------------------------- |
| Criar link                | `POST /paymentlinks`          | Gera o link/checkout para o comprador pagar. |
| Obter link                | `GET /paymentlinks/{id}`      | —                                            |
| Listar links              | `GET /paymentlinks`           | —                                            |
| Ativar link em construção | rota de ativação              | Link criado em rascunho.                     |
| Cancelar link             | `DELETE`/rota de cancelamento | —                                            |

Eventos relacionados: `checkout.created`, `checkout.closed`, `checkout.canceled`.

---

## 17. Webhooks

Sempre que ocorre um evento relevante, a Pagar.me envia uma notificação **HTTP POST** para os endpoints configurados na sua conta. É possível configurar vários endpoints e selecionar quais eventos disparam.

### 17.1 Formato da entrega

O corpo do webhook envolve o recurso afetado. Estrutura típica (v5):

```json
{
  "id": "hook_xxxxxxxxxxxxxxxx",
  "account": { "id": "acc_xxxxxxxxxxxxxxxx", "name": "Minha Loja" },
  "type": "order.paid",
  "created_at": "2021-09-01T12:00:00Z",
  "data": {
    "...": "objeto completo do recurso (order/charge/subscription/etc.)"
  }
}
```

- `type`: nome do evento (tabela abaixo).
- `data`: o objeto do recurso no estado do evento.
- Configure o endpoint para responder **HTTP 2xx** rapidamente; caso contrário a Pagar.me reenvia (política de retentativa). Trate as entregas de forma **idempotente** (o mesmo evento pode chegar mais de uma vez).
- Endpoints de gerenciamento de webhooks: `/hooks` (rate limit 50/min).

### 17.2 Eventos disponíveis

| Evento                                                                                                                                     | Ocorre quando                                         |
| :----------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------- |
| `customer.created` / `customer.updated`                                                                                                    | Comprador criado/atualizado.                          |
| `card.created` / `card.updated` / `card.deleted` / `card.expired`                                                                          | Cartão criado/atualizado/excluído/expirado.           |
| `address.created` / `address.updated` / `address.deleted`                                                                                  | Endereço criado/atualizado/excluído.                  |
| `plan.created` / `plan.updated` / `plan.deleted`                                                                                           | Plano criado/atualizado/excluído.                     |
| `plan_item.created` / `plan_item.updated` / `plan_item.deleted`                                                                            | Item de plano criado/atualizado/excluído.             |
| `subscription.created` / `subscription.canceled`                                                                                           | Assinatura criada/cancelada.                          |
| `subscription_item.created` / `subscription_item.updated` / `subscription_item.deleted`                                                    | Item de assinatura criado/atualizado/excluído.        |
| `discount.created` / `discount.deleted`                                                                                                    | Desconto criado/excluído.                             |
| `increment.created` / `increment.deleted`                                                                                                  | Incremento criado/excluído.                           |
| `order.created` / `order.paid` / `order.payment_failed` / `order.canceled` / `order.closed` / `order.updated`                              | Ciclo de vida do pedido.                              |
| `order_item.created` / `order_item.updated` / `order_item.deleted`                                                                         | Item de pedido criado/atualizado/excluído.            |
| `invoice.created` / `invoice.updated` / `invoice.paid` / `invoice.payment_failed` / `invoice.canceled`                                     | Ciclo de vida da fatura.                              |
| `charge.created` / `charge.updated` / `charge.paid` / `charge.payment_failed` / `charge.refunded` / `charge.pending` / `charge.processing` | Ciclo de vida da cobrança.                            |
| `charge.underpaid` / `charge.overpaid` / `charge.partial_canceled` / `charge.chargedback`                                                  | Pago a menor/maior, cancelamento parcial, chargeback. |
| `charge.antifraud_approved` / `charge.antifraud_reproved` / `charge.antifraud_manual` / `charge.antifraud_pending`                         | Resultado do antifraude.                              |
| `usage.created` / `usage.deleted`                                                                                                          | Uso de item no período criado/excluído.               |
| `recipient.created` / `recipient.updated` / `recipient.deleted`                                                                            | Recebedor criado/atualizado/excluído.                 |
| `bank_account.created` / `bank_account.updated` / `bank_account.deleted`                                                                   | Conta bancária criada/atualizada/excluída.            |
| `checkout.created` / `checkout.closed` / `checkout.canceled`                                                                               | Ciclo de vida do checkout.                            |

---

## 18. Tabela de referência de status (enums)

### Charge (`charge.status`)

`pending`, `paid`, `processing`, `canceled`, `failed`, `overpaid`, `underpaid`, `chargedback`, `refunded`, `partial_canceled`.

### Order (`order.status`)

`pending`, `paid`, `canceled`, `failed`, `processing`, `closed` (+ `closed: true/false` indica aberto/fechado).

### Transaction — cartão (`last_transaction.status`)

`authorized_pending_capture`, `captured`, `partial_capture`, `waiting_capture`, `not_authorized`, `voided`, `partial_void`, `refunded`, `with_error`, `failed`, `error_on_voiding`, `waiting_cancellation`.
(Campos correlatos: `success` boolean, `operation_type` = `auth_and_capture`/`auth_only`/`pre_auth`/`capture`/`void`.)

### Transaction — boleto

`generated`, `viewed`, `underpaid`, `overpaid`, `paid`, `voided`, `with_error`, `failed`, `processing`.

### Transaction — Pix

`waiting_payment`, `paid`, `pending_refund`, `refunded`, `with_error`, `failed`.

### Subscription (`subscription.status`)

`active`, `canceled`, `future`, `expired` (+ `trialing` quando há período de teste). `billing_type`: `prepaid`, `postpaid`, `exact_day`.

### Plan (`plan.status`)

`active`, `inactive`/`deleted`.

### Recipient (`recipient.status`)

`active`, `inactive`, `affiliation`, `refused`, `suspended`, `blocked`, `registration`. `payment_mode`: ex. `bank_transfer`.

### Anticipation

`pending` (cancelável), `building`, `transferred`, `failed`, `signature_required`, `processing`.

> Enums marcados como "correlatos/quando há" derivam do comportamento documentado; confirme valores raros na página do recurso específico.

---

## 19. Receitas de integração

### 19.1 Pagamento à vista com cartão (one-off)

1. (Opcional) `POST /customers` → guarde `cus_...`.
2. (Opcional) `POST /customers/{cus}/cards` ou tokenize via checkout transparente → `card_id`/`card_token`.
3. `POST /orders` com `items`, `customer`/`customer_id` e `payments[0].credit_card` (`operation_type: auth_and_capture`).
4. Verifique `charges[0].status == "paid"` e `last_transaction.status == "captured"`.
5. Confirme assíncronamente via webhook `order.paid` / `charge.paid`.

### 19.2 Autorização + captura posterior

1. `POST /orders` com `credit_card.operation_type = "auth_only"` (ou `pre_auth`).
2. Cobrança fica autorizada (não capturada).
3. `POST /charges/{charge_id}/capture` (com `amount` opcional para captura parcial).

### 19.3 Pix dinâmico

1. `POST /orders` com `payments[0].pix.expires_in`.
2. Exiba ao cliente `last_transaction.qr_code` (copia-e-cola) e/ou `qr_code_url` (imagem).
3. Aguarde webhook `charge.paid` / `order.paid`. Não confie apenas no front-end.
4. Estorno: `DELETE /charges/{charge_id}`.

### 19.4 Boleto registrado

1. `customer` com `name`, `document` e `address` obrigatórios.
2. `POST /orders` com `payments[0].boleto` (`due_at`, `instructions`, opcional `interest`/`fine` — só PSP).
3. Entregue `last_transaction.line`, `pdf`, `barcode` ao cliente.
4. Baixa via webhook `charge.paid`.

### 19.5 Marketplace com split

1. `POST /recipients` para cada parte (marketplace + sellers).
2. `POST /orders` com `payments[0].split[]` referenciando `recipient_id`, definindo `liable`, `charge_processing_fee`, `charge_remainder_fee`.
3. Acompanhe recebíveis em `/payables` e settlements por recebedor.

### 19.6 Assinatura recorrente

1. `POST /plans` (ou prepare dados avulsos).
2. `POST /subscriptions` com `plan_id`, `payment_method`, `customer` e `card`.
3. A API gera ciclos e invoices automaticamente; ouça `invoice.paid`, `charge.paid`, `subscription.canceled`.
4. CVV apenas na primeira cobrança da recorrência.

---

## 20. Índice de endpoints e páginas oficiais

> Caminhos inferidos do padrão REST v5 + páginas oficiais (`.md`) em `https://docs.pagar.me/reference/`. Para o schema autoritativo de cada um, acesse a página correspondente.

**Clientes / cartões / endereços**

- `POST /customers` — criar cliente — `criar-cliente-1`
- `POST /customers/{id}/addresses` — criar endereço — `criar-endereço-1`
- `POST /customers/{id}/cards` — criar cartão — `criar-cartão`
- `POST /tokens` — criar token de cartão — `criar-token-cartão-1`
- `PUT /customers/{id}/cards/{card_id}` — editar cartão — `editar-cartão`
- Objeto cartões — `cartões-1`

**Pedidos / meios de pagamento**

- `POST /orders` — criar pedido (com split) — `criar-pedido-2`
- Incluir cobrança no pedido — `incluir-cobrança-no-pedido`
- Boleto — `boleto-1` · Cartão de crédito — `cartão-de-crédito-1` · Cartão de débito — `cartão-de-débito-2` · Pix — `pix-2` · Voucher — `voucher-1` · Private label — `cartão-private-label-2` · Google Pay — `google-paytm-api`

**Cobranças**

- `GET /charges/{charge_id}` — obter cobrança — `obter-cobrança`
- Editar método de pagamento — `editar-método-de-pagamento`
- Editar cartão de cobrança — `editar-cartão-de-cobrança`

**Recebedores / split / financeiro**

- `POST /recipients` — criar recebedor — `criar-recebedor-1`
- `GET /recipients/{id}` — obter — `obter-recebedor-1` · `PUT` editar — `editar-recebedor-1`
- Objeto recebedores — `recebedores-1` · Saque — `saque-1`
- Atualizar transferência — `atualizar-informações-de-transferência-1` · Editar code — `atualizar-code-de-recebedor` · Prova de Vida (KYC) — `criar-link-recebedor`
- Operações de saldo — `operação-de-saldo` · Recebíveis — `retornando-recebíveis`
- Settlements — `objeto-settlements`, `retornando-pagamentos`, `retornando-pagamentos-por-recebedor`, `retornando-um-pagamento`

**Planos / assinaturas**

- `POST /plans` — criar plano — `criar-plano-1` · `PUT` editar — `editar-plano-1` · Objeto — `planos-1`
- `POST /subscriptions` — criar assinatura de plano — `criar-assinatura-de-plano-1` · avulsa — `criar-assinatura-avulsa`
- Renovar ciclo — `renovar-ciclo-1` · Objeto assinaturas — `assinaturas-1`

**Transferências / antecipações**

- Criar transferência — `criando-uma-transferência` · Cancelar — `cancelando-uma-transferência` · Objeto — `objeto-transferência`
- Retornar transferências — `retornando-transferências`, `retornando-uma-transferência` · Comprovante — `retornando-o-comprovante-de-uma-transferência`
- Criar antecipação — `criando-uma-antecipação` · Cancelar pending — `cancelando-uma-antecipação-pending` · Limites — `obtendo-os-limites-de-antecipação` · Listar — `retornando-antecipações` · Simular Spot — `simulando-uma-antecipação-spot` · Objeto — `objeto-antecipação`

**Disputas / contratos (Res. 264/349)**

- Listar disputas — `get_v1-disputes` · Consultar — `get_v1-disputes-dispute-id` · Enviar evidência — `post_v1-disputes-dispute-id-evidences` · Objeto — `disputas`
- Contestar contrato — `contestando-um-contrato-v5` · Retornar contratos — `retornando-efeitos-de-contratos-copy` · Efeitos — `retornando-efeitos-de-contratos-v5` · Contestações — `retornando-contestacoes` · URs — `retornando-urs-de-um-recebedor-v5`

**Links de pagamento**

- Criar — `criar-link` · Obter — `obter-link` · Listar — `obter-links` · Ativar — `ativar-link-de-pagamento-em-construção` · Cancelar — `cancelar-um-link-de-pagamento` · Checkout — `checkout-response`, `checkout-link`

**Webhooks / geral**

- Visão geral — `visão-geral-sobre-webhooks` · Eventos — `eventos-de-webhook-1`
- Getting started — `getting-started-with-your-api` · Segurança/PCI — `segurança-1` · Rate limit — `rate-limit` · Subadquirente — `facilitadores-de-pagamento-dados-de-subadquirente`

---

## 21. Glossário

| Termo                                 | Significado                                                                                                                               |
| :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **Gateway**                           | Modalidade em que a Pagar.me processa a transação, mas a liquidação financeira não é feita por ela. Pode usar `card_token`.               |
| **PSP**                               | _Payment Service Provider_: a Pagar.me processa **e** liquida. Recomenda-se `card_id`. Habilita juros/multa em boleto, split de Pix, etc. |
| **Order (pedido)**                    | Agregador de itens + comprador + pagamentos.                                                                                              |
| **Charge (cobrança)**                 | Cobrança de um valor; pertence a um pedido ou recorrência.                                                                                |
| **Transaction (transação)**           | Tentativa de processamento de uma cobrança. `last_transaction` é a mais recente.                                                          |
| **Recipient (recebedor)**             | Entidade que recebe parte de uma venda (split).                                                                                           |
| **Split**                             | Divisão do valor de uma venda entre recebedores.                                                                                          |
| **Wallet**                            | Conjunto de cartões de um cliente.                                                                                                        |
| **Plan (plano)**                      | Template de recorrência.                                                                                                                  |
| **Subscription (assinatura)**         | Recorrência ativa de um cliente.                                                                                                          |
| **Invoice (fatura)**                  | Documento de cobrança gerado por ciclo de assinatura.                                                                                     |
| **Payable (recebível)**               | Valor a receber resultante de uma transação.                                                                                              |
| **UR**                                | Unidade de Recebíveis (Res. 264/349 do BC).                                                                                               |
| **Antecipação**                       | Adiantamento de recebíveis futuros.                                                                                                       |
| **3DS**                               | Autenticação 3-D Secure; reduz fraude/chargeback.                                                                                         |
| **Network Token / Token de bandeira** | Tokenização do PAN pela bandeira; campos `network_token`.                                                                                 |
| **MIT/CIT**                           | _Merchant/Customer Initiated Transaction_; controlado por `recurrence_model`/`initiated_type`.                                            |
| **Zero Dollar Auth**                  | Verificação de cartão sem cobrança (`options.verify_card`).                                                                               |

---

_Documento gerado a partir da documentação pública da Pagar.me (API v5). Para campos não listados, fluxos específicos de antifraude/3DS e parâmetros de listagem/paginação detalhados, consulte a página oficial do endpoint correspondente em `https://docs.pagar.me/reference`._
