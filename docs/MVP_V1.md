# MVP comercial V1 — Control Premium

## 1. Objetivo

Entregar uma primeira versão comercial segura para uma empresa gerenciar clientes, propostas, contratos, empréstimos, parcelas, pagamentos e cobranças, com portal do cliente e trilha de auditoria.

O MVP é brasileiro, opera em BRL e preserva a interface visual aprovada.

## 2. Usuários

| Perfil | Responsabilidade |
|---|---|
| Super Admin | Operação da plataforma e suporte controlado |
| Administrador | Gestão da empresa, usuários e configurações |
| Gestor | Clientes, propostas, contratos e relatórios autorizados |
| Cobrador | Carteira/rota atribuída e registros permitidos |
| Cliente | Contratos, parcelas, PIX, comprovantes e atendimento |

## 3. Incluído no MVP

### Conta e segurança

- cadastro e autenticação da empresa;
- login seguro, recuperação e confirmação de contato;
- papéis e permissões;
- MFA administrativo;
- isolamento multiempresa com RLS;
- auditoria de ações sensíveis;
- backup e restauração testados.

### Clientes

- cadastro manual e por convite seguro;
- contatos, endereços e documentos;
- pesquisa, visualização, edição e arquivamento;
- validação e prevenção de duplicidade;
- histórico cadastral;
- políticas de retenção e anonimização.

### Propostas e empréstimos

- solicitação, análise humana, aprovação ou recusa registrada;
- simulador conforme regras financeiras aprovadas;
- geração de empréstimo e cronograma;
- frequências diária, dias úteis, semanal, quinzenal e mensal;
- parcelas, pagamento integral/parcial, saldo, quitação e estorno;
- recibos e razão financeira.

### Contratos

- modelo revisado;
- PDF identificado e imutável;
- assinatura eletrônica;
- armazenamento e evidências;
- versões e aditivos.

### PIX

- cobrança por parcela;
- QR Code e copia-e-cola;
- webhook autenticado e idempotente;
- baixa, recibo, conciliação e tratamento de divergências.

### WhatsApp

- convite para cadastro;
- templates oficiais de lembrete e confirmação;
- horários, consentimento e opt-out;
- fila, tentativas, deduplicação e histórico;
- transferência para atendimento humano.

### Painéis

- dashboard com valores conciliados;
- agenda e carteira;
- relatórios e exportações autorizadas;
- portal seguro do cliente;
- notificações operacionais.

### SaaS

- planos, limites e assinatura recorrente;
- upgrade, downgrade, tolerância e cancelamento;
- bloqueio controlado sem apagar dados;
- métricas operacionais.

## 4. Fora do primeiro MVP

| Recurso | Motivo para adiar |
|---|---|
| Aplicativos Flutter públicos | Aguardar API e regras estáveis |
| IA autônoma | Risco de decisão, privacidade e custo |
| Score externo automático | Exige provedor, base legal e governança |
| Offline completo | Complexidade de sincronização financeira |
| Múltiplos provedores simultâneos | Primeiro validar um adaptador por integração |
| Marketplace de crédito | Escopo regulatório e operacional distinto |
| Cobrança por voz automática | Consentimento, custo e risco reputacional |
| Geolocalização contínua | Privacidade e necessidade ainda não comprovada |
| White-label completo | Não necessário para validar o produto |

Esses itens permanecem no backlog e só serão priorizados por impacto, risco, esforço e receita.

## 5. Jornada vertical de aceite

1. Empresa é cadastrada e administrador entra com autenticação real.
2. Administrador cadastra cliente ou envia convite pelo WhatsApp.
3. Cliente envia dados e documentos.
4. Administrador revisa e aprova o cadastro.
5. Proposta é criada e calculada com regra aprovada.
6. Decisão humana é registrada.
7. Contrato é gerado e assinado.
8. Empréstimo gera parcelas.
9. Parcela gera cobrança PIX.
10. Webhook confirmado dá baixa uma única vez.
11. Cliente e administrador recebem confirmação.
12. Dashboard, recibo, saldo e auditoria exibem o mesmo resultado.

## 6. Critérios de aceite

- nenhum dado de uma empresa aparece para outra;
- nenhum segredo existe no repositório ou logs;
- valores financeiros fecham no centavo;
- webhooks repetidos não duplicam pagamentos;
- toda alteração financeira é rastreável;
- PIX não é marcado como pago sem confirmação válida;
- mensagens respeitam política de horário e destinatário;
- decisão de crédito exige responsável humano;
- o fluxo funciona em celular e computador;
- backup pode ser restaurado;
- não existem falhas críticas abertas;
- a interface permanece fiel ao protótipo aprovado.

## 7. Ordem de construção

1. Fundação técnica.
2. Banco multiempresa.
3. Autenticação e permissões.
4. Migração fiel da interface.
5. Fluxo real de clientes.
6. Cadastro por convite e WhatsApp.
7. Propostas.
8. Núcleo financeiro.
9. Contratos.
10. PIX.
11. Cobrança.
12. Painéis e portal.
13. Assinatura SaaS.
14. IA controlada.
15. Segurança, testes e piloto.
16. Mobile.
