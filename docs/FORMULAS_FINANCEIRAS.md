# Formulas financeiras — Control Premium

Este documento descreve, com precisao, as formulas ja implementadas em
`packages/domain/src/money.ts`, `proposal.ts` e `loan.ts`. Toda alteracao futura nas regras
financeiras deve ser refletida aqui primeiro (documento vivo).

## 1. Representacao de valores (money.ts)

- Todo valor monetario e um inteiro em **centavos** (nunca ponto flutuante).
- `Number.isSafeInteger` e exigido em toda entrada de valor. Nao existe arredondamento
  implicito por float em nenhum calculo.

## 2. Formula dos juros (proposal.ts -> simulateProposal)

Juros simples sobre o valor total do periodo contratado (nao e "juros compostos" nem
"tabela Price" com recalculo mensal sobre saldo devedor):

```
juros = arredonda(principal_centavos * taxa_periodica_bps * numero_parcelas / 10000)
total = principal_centavos + juros
```

- `taxa_periodica_bps` e a taxa por parcela, em pontos-base (1 bps = 0.01%). Uma taxa de
  20% ao periodo e informada como `2000`.
- O arredondamento e "para o mais proximo" (round half up), feito com BigInt para nunca
  perder precisao mesmo em valores grandes.

## 3. Formula das parcelas (proposal.ts -> simulateProposal)

```
valor_base_parcela = total // numero_parcelas   (divisao inteira)
resto = total % numero_parcelas
```

O resto (em centavos) e distribuido **1 centavo a mais** para as primeiras `resto` parcelas
(indice 0 ate resto-1), e as demais recebem o valor base. Isso garante que a soma exata das
parcelas bate com o `total`, sem sobra nem falta de centavos em nenhuma hipotese.

## 4. Datas de vencimento (proposal.ts -> installmentDueDate)

- **Diario:** soma dias uteis sequencialmente a partir da primeira data (pula sabado,
  domingo e feriados informados).
- **Semanal / quinzenal:** soma 7 ou 14 dias corridos por parcela e, se cair em fim de
  semana ou feriado, empurra para o proximo dia util.
- **Mensal:** soma meses corridos (ajustando para o ultimo dia do mes quando o dia nao
  existe, ex: 31 de janeiro + 1 mes = 28/29 de fevereiro) e tambem empurra para o proximo
  dia util se necessario.

## 5. Saldo devedor (loan.ts -> calculateOutstandingCents)

```
saldo_devedor = soma((valor_previsto_parcela - valor_pago_parcela) para cada parcela)
```

## 6. Alocacao de pagamento (loan.ts -> allocatePayment)

Pagamentos sao aplicados **da parcela mais antiga para a mais nova** (ordenado por numero
crescente). Cada parcela recebe `min(valor_restante_do_pagamento, saldo_da_parcela)` ate o
pagamento inteiro ser distribuido. Nao ha opcao hoje de aplicar direto no principal ou pular
parcelas antigas.

## 7. Score de credito (proposal.ts -> calculateExplainableCreditScore)

Pontuacao 0-100, some das partes:

| Fator | Pontos maximos | Regra |
|---|---|---|
| Identidade verificada | 20 | tudo ou nada |
| Endereco verificado | 15 | tudo ou nada |
| Renda verificada | 35 | tudo ou nada |
| Tempo de relacionamento | 15 | 1 ponto a cada 4 meses, limitado a 15 |
| Divida/renda declarada | 15 | 15 pts se ate 30%, 8 pts se ate 50%, 0 pts acima disso |

Faixa de risco: `>= 80` baixo risco, `>= 50` medio, abaixo disso alto risco.

**Importante:** o tipo `ExplainableCreditScore` trava em codigo (`requiresHumanDecision: true`)
que o score **nunca** decide sozinho se um credito e aprovado — ele so informa/explica, a
decisao final e sempre humana.

## 8. O que o documento "Implementacao Final" pede e AINDA NAO EXISTE

O documento enviado por Victor pede: *"Caso o calculo utilize saldo devedor, recalcular
automaticamente os juros apos cada amortizacao."*

Isso descreve um metodo **diferente** do que esta implementado hoje. Hoje o sistema calcula
os juros **uma unica vez**, no momento da proposta (juros simples sobre o total, parcelas
fixas desde o inicio). Pagamentos antecipados reduzem o saldo mas **nao recalculam** os
juros das parcelas futuras.

Para atender o pedido, sera necessario decidir e implementar um dos dois modelos abaixo
(ou oferecer os dois, um por configuracao de tenant):

- **Juros simples fixo (atual):** parcelas fixas desde a proposta, sem recalculo. Mais
  simples, mais previsivel pro cliente, mas nao "premia" quitacao antecipada com menos juros.
- **Saldo devedor com recalculo (tipo Price/SAC):** a cada amortizacao, os juros das
  parcelas futuras sao recalculados sobre o saldo remanescente. Mais justo para quitacao
  antecipada, porem exige mudar o schema (parcelas deixam de ter `scheduledCents` fixo desde
  a criacao) e re-testar todo o motor financeiro.

Esta decisao (qual dos dois modelos usar, ou ambos) precisa ser tomada antes do item 2 do
roadmap (modulo Venda Parcelada), porque afeta o desenho do schema.
