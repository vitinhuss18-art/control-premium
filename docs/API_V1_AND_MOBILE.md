# API v1 e preparação mobile

## Contrato estável

Aplicativos web e mobile consomem a mesma camada de aplicação. Os recursos públicos ficam
sob `/api/v1`; alterações incompatíveis exigem `/api/v2`.

Operações principais:

- autenticação e recuperação pelo provedor configurado;
- clientes e documentos privados;
- propostas, checklist, parecer e decisão humana;
- empréstimos, parcelas, pagamentos, recibos e estornos;
- contratos e evidências de assinatura;
- cobrança PIX e conciliação;
- mensagens oficiais;
- portal do cliente;
- planos e assinatura SaaS.

Toda mutação financeira exige `Idempotency-Key`. Erros não expõem existência de outro
tenant. Datas usam ISO 8601 e dinheiro usa centavos inteiros em BRL.

## Perfis mobile

- administrador/gestor: clientes, propostas, aprovações, relatórios e configurações;
- operador: clientes, propostas e documentos autorizados;
- cobrador: agenda, cobranças permitidas e registros de contato;
- cliente: contrato, saldo, parcelas, recibos, PIX e atendimento.

## Segurança mobile

- tokens somente em armazenamento seguro do sistema;
- biometria apenas como proteção local, nunca como substituta da autenticação do servidor;
- pinning somente após plano de rotação de certificados;
- cache offline mínimo, criptografado e sem documentos sensíveis;
- logout revoga sessão e remove cache;
- deep links usam domínio verificado e allowlist;
- builds de loja não recebem segredos em tempo de compilação.

## Gate para Flutter

O projeto Flutter completo começa após:

1. API v1 estabilizada e testada;
2. interface web migrada fielmente e aprovada;
3. autenticação real conectada;
4. RLS comprovada no Supabase;
5. contas Google Play e Apple conectadas.

Esse gate evita duplicar telas e regras ainda instáveis. Até lá, o navegador responsivo
continua sendo a referência funcional.
