# Roadmap — Implementação Final (Venda Parcelada + Plataforma Genérica)

Este documento mapeia o plano "Implementação Final" enviado por Victor contra o estado real
do repositório em 25/07/2026, e define a ordem de execução. Ele não substitui o `ROADMAP.md`
técnico existente — é um roadmap complementar, focado nesta iniciativa específica.

## Legenda
- Feito: já existe e funciona (verificado por teste automatizado ou leitura de código)
- Parcial: existe a base, falta adaptar
- Pendente: não existe, precisa ser criado do zero

## 1. Reaproveitamento da arquitetura

| Funcionalidade | Estado | Onde vive |
|---|---|---|
| Cadastro de clientes | Feito | packages/domain/src/client.ts, tabela clients |
| Contratos | Feito | packages/domain/src/contract.ts, tabela contracts |
| Cobrancas / Parcelas | Feito | installments, payments, record_loan_payment() |
| Cobrador | Parcial | tabela collection_events existe; sem UI dedicada ainda |
| Landing Page (cadastro por link) | Feito | apps/web/src/app/cadastro, corrigida nesta sessao |
| IA | Parcial | tabela ai_suggestions existe; sem chamadas de IA reais ainda |
| Notificacoes | Parcial | tabela notifications existe; sem envio real (depende de WhatsApp Business) |
| Relatorios | Parcial | packages/domain/src/reporting.ts existe; sem UI/dashboard ainda |
| Dashboard | Pendente | nao existe UI ainda (apps/web so tem health-check e a landing) |
| Agenda | Pendente | nao existe |

Conclusao: a base e real e testada (96 testes passando), mas ainda e majoritariamente
backend/dominio -- falta a maior parte da interface do administrador (Dashboard, Agenda,
Cobrador) no app novo. O index.html (prototipo) ja tem essas telas visualmente, mas
funcionando so com localStorage, nao com o banco real.

## 2. Modulo "Venda Parcelada" — Pendente

Precisa:
- Novo campo operation_type em credit_proposals/loans ('loan' ou 'installment_sale')
- Novos campos especificos de venda: produto, descricao, foto do produto, valor da venda,
  entrada, quantidade de parcelas, juros (opcional)
- Adaptar packages/domain/src/proposal.ts e loan.ts para aceitar o novo tipo sem duplicar
  toda a logica de parcelamento (que ja e generica o suficiente para ser reaproveitada)

## 3. Tipo de operacao antes do contrato — Pendente
Depende do item 2 estar pronto primeiro.

## 4. Revisao das regras financeiras — Parcial
Ja auditado nesta sessao: money.ts (centavos inteiros, sem ponto flutuante), loan.ts e
proposal.ts (BigInt, distribuicao de resto entre parcelas, dias uteis/feriados) -- solidos e
testados. Falta: logica de recalculo de juros sobre saldo devedor apos amortizacao
antecipada (nao encontrada ainda) e a documentacao formal (item 8).

## 5. Configuracao "Repassar custos operacionais" — Pendente
Precisa: campo de configuracao por tenant + formula de rateio nas parcelas.

## 6. Proposta automatica com valor total antes de aceitar — Parcial
A landing page ja calcula e envia loan_amount_cents, mas nao mostra ainda juros/parcelas/
total ao cliente antes de enviar (porque isso so e definido depois, na aprovacao do admin).
Precisa decidir: o cliente informa so o valor desejado (fluxo atual) ou ja simula uma proposta
com juros padrao antes de enviar?

## 7. Consistencia Proposta = Contrato = Parcelas — Parcial
credit_proposals.calculation_snapshot (jsonb) ja existe no schema pra guardar o "congelamento"
dos valores no momento da aprovacao -- mecanismo certo, mas ainda nao e preenchido por nenhum
codigo.

## 8. Documentacao das formulas — Pendente (ver arquivo docs/FORMULAS_FINANCEIRAS.md)

## 9-11. Dashboard, Agenda, Notificacoes, IA, testes, publicacao — Pendente/Parcial conforme tabela acima

## Ordem de execucao recomendada
Seguindo a ordem que voce definiu no documento, com uma adaptacao: documentar as formulas
(item 8) precisa vir durante a revisao (item 1/4), nao depois -- e o mesmo trabalho.

1. Revisar calculos financeiros -- feito e documentado nesta sessao
2. Modelar "Venda Parcelada" no banco (schema) e no dominio (packages/domain)
3. Configuracao de custos operacionais
4. Consistencia proposta -> contrato -> parcelas (usar calculation_snapshot)
5. Validar landing page com o novo tipo de operacao
6. Dashboard (novo, nao existe)
7. Agenda (novo, nao existe)
8. Cobrador (UI)
9. Notificacoes reais (depende de WhatsApp Business -- bloqueado por decisao de negocio)
10. IA (depende de definir qual modelo/uso)
11. Testes completos + publicacao
