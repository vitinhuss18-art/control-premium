# Decisões de negócio pendentes

Estas decisões serão solicitadas somente quando bloquearem o próximo bloco. Até lá, o código usará interfaces e configurações sem inventar regras.

## Prioridade 1 — conexões

| Decisão | Impacto | Momento |
|---|---|---|
| Provedor PIX oficial | API, webhook, custos e homologação | Bloco B |
| Titularidade e tipo da conta PIX | Elegibilidade e contrato | Bloco B |
| Provedor oficial de WhatsApp | Templates, número, custos e limites | Bloco B |
| Número comercial | Verificação e identidade da operação | Bloco B |
| Domínio principal | URLs, e-mail e links de cadastro | Bloco B/C |
| Supabase e hospedagem | Ambientes e região de dados | Bloco B/C |

## Prioridade 2 — regras financeiras

1. Juros são fixos, simples, compostos ou configuráveis?
2. A taxa é mensal, por operação ou por período de cobrança?
3. Qual método de amortização será usado?
4. Como arredondar centavos e distribuir diferenças?
5. Quais frequências serão permitidas por plano?
6. Como tratar sábados, domingos e feriados?
7. Quando ocorre o primeiro vencimento?
8. Pagamento parcial reduz parcela, parcelas futuras ou prazo?
9. Como calcular quitação antecipada?
10. Quais multa, juros de atraso e tolerância são permitidos?
11. Quem pode dar baixa manual, estornar ou renegociar?
12. Em quais casos uma parcela pode ser cancelada?

Essas respostas precisarão de validação contábil e jurídica antes de produção.

## Prioridade 3 — crédito e documentos

1. Quais documentos são obrigatórios?
2. Quais dados são indispensáveis e quais são opcionais?
3. Quais estados de cliente e proposta serão usados?
4. Quais valores exigem segunda aprovação?
5. Quais motivos de recusa podem ser registrados?
6. Quanto tempo documentos e propostas serão mantidos?
7. Haverá consulta a fonte externa de crédito?
8. Quem pode ver o score e o parecer?

## Prioridade 4 — cobrança e comunicação

1. Quais horários e dias permitem mensagens?
2. Quantas tentativas por evento?
3. Quais templates serão revisados e aprovados?
4. Como o cliente solicita atendimento humano?
5. Como registrar consentimento e opt-out?
6. Quais mensagens podem ser enviadas ao cobrador?
7. Quais feriados ou regiões alteram o calendário?

## Prioridade 5 — SaaS

1. Nomes, preços e limites dos planos.
2. Período gratuito, se houver.
3. Regras de atraso e tolerância.
4. Recursos bloqueados por plano.
5. Política de upgrade, downgrade, cancelamento e reembolso.
6. Emissão fiscal e impostos aplicáveis.
7. Canais e horário de suporte.

## Prioridade 6 — privacidade e operação

1. Razões sociais e dados da controladora do serviço.
2. Política de privacidade e termos.
3. Base legal por finalidade.
4. Retenção e descarte.
5. Exportação, correção e anonimização.
6. Responsáveis por incidentes e suporte.
7. Meta de disponibilidade e tempo de recuperação.

## Regra de decisão

Quando uma resposta faltar, a entrega deve:

- manter o ponto configurável;
- usar dados fictícios;
- bloquear a operação real que depende da decisão;
- registrar a pendência;
- não inventar juros, cobrança, consentimento ou permissão.
