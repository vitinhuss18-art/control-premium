# Changelog

Todas as alterações relevantes do Control Premium serão registradas neste arquivo.

O formato segue os princípios de Keep a Changelog e versionamento semântico quando o produto possuir versões publicáveis.

## [Não publicado]

### Adicionado

- Roteiro operacional de 228 etapas e 19 marcos.
- Cópia imutável do protótipo oficial V1.
- Branch `develop` para integração das entregas aprovadas.
- Política de desenvolvimento por branches e pull requests.
- Arquitetura técnica alvo.
- Inventário completo das telas, funções, simulações, dados fictícios e dependências locais.
- Definição do MVP comercial e separação do backlog futuro.
- Registro das decisões de negócio pendentes.
- Modelo inicial de banco multiempresa e políticas RLS, ainda sujeitos à validação dos Blocos C e D.
- Exemplo de variáveis de ambiente sem segredos.

### Aprovado

- Bloco A aprovado pelo proprietário em 24/07/2026.
- Escopo do MVP congelado para execução automática.
- Pendências que exigem conta, identidade, contrato, credenciais ou decisão externa passam a ser reunidas para a etapa final.

### Fundação técnica

- Monorepo npm com `apps/web` e pacotes de UI, domínio, configuração e integrações.
- Next.js 16, React 19 e TypeScript estrito.
- Protótipo oficial servido sem alteração por uma camada Next.js.
- Dinheiro representado em centavos inteiros no domínio.
- Verificação de isolamento por empresa no domínio.
- Contratos independentes para provedores PIX e WhatsApp.
- Migração de Storage privado com RLS por empresa.
- Formatação, lint, tipos, testes unitários, build e smoke test E2E.
- Pipeline de integração contínua para `main`, `develop` e pull requests.
- Endpoint de saúde e logger com remoção de campos sensíveis.

### Banco e acesso

- Modelo completo para clientes, propostas, empréstimos, parcelas, pagamentos, cobranças, contratos, PIX, webhooks e assinatura SaaS.
- Chaves estrangeiras compostas que impedem relações cruzadas entre empresas.
- RLS e funções de autorização para Super Admin, Administrador, Gestor, Operador, Cobrador e Cliente.
- Cadastro inicial seguro de empresa e aceite de convite por token armazenado somente como hash.
- Registro de eventos de autenticação e exigência de MFA para funções administrativas.
- Dados fictícios, teste de isolamento multiempresa e roteiro de backup/restauração.
- Matriz de permissões compartilhada pelo domínio TypeScript e pelo banco.

### Fluxo de clientes

- Validação e normalização de nome, CPF opcional, telefone, e-mail e nascimento.
- Serviço de aplicação para cadastrar, pesquisar, visualizar, editar e arquivar clientes.
- Prevenção de CPF duplicado dentro da mesma empresa.
- Porta de documentos com limite de 10 MB e caminho privado por empresa/cliente.
- Auditoria obrigatória para cadastro, edição, arquivamento e documento.
- Testes de permissões, duplicidade e isolamento entre empresas.

### Cadastro por link

- Convite vinculado à empresa e ao cliente, com expiração configurável de 1 a 72 horas.
- Token de uso único mantido em texto apenas durante a geração do link e persistido somente como hash.
- Endereço HTTPS obrigatório e fila transacional preparada para o template oficial do WhatsApp.
- Preenchimento validado e consumo atômico do convite para impedir repetição.
- Auditoria do convite e da conclusão, com erros públicos genéricos para evitar enumeração.
- Testes de expiração, repetição, autorização e normalização do número brasileiro.

### Segurança

- Proibição explícita de segredos no código e na documentação.
- Regra de isolamento multiempresa por `tenant_id` e RLS.
- Regra de decisão humana para crédito.
- Regra de idempotência e auditoria para operações financeiras.

### Preservado

- Identidade visual e comportamento do protótipo `ControlPremium_PROTOTIPO_OFICIAL_V1.html`.

### Sessão 25-26/07/2026 (Claude)

- Correção de segurança real na política de inserção de `client_proposals` (permitia
  inserção sem token válido) e na política de storage de documentos (permitia upload
  irrestrito) — ambas introduzidas por uma sessão anterior do Codex.
- Correção de 2 erros de lint reais (`react-hooks/refs`, `react-hooks/set-state-in-effect`)
  na página `/cadastro`.
- Módulo de domínio "Venda Parcelada" (`installmentSale.ts`), reaproveitando
  `simulateProposal()` integralmente — juros fixo, sem duplicar lógica.
- Módulo de domínio "Custos operacionais" (`operationalCost.ts`), configurável por empresa
  (percentual ou valor fixo), distribuído nas parcelas.
- Migrações 11 a 13 (`installment_sale`, `operational_costs`, `proposal_decisions`).
- Login de cliente real protegido por CPF + quatro últimos dígitos do WhatsApp, com
  resposta mínima, recusa de combinações multiempresa ambíguas e remoção da versão que
  aceitava somente CPF.
- Seção "Propostas recebidas pelo link" dentro da tela existente do `index.html`
  (não foi criada tela/rota separada, a pedido do proprietário), com login inline via
  Supabase Auth, listagem de `client_proposals` pendentes e decisão (aprovar cria o
  cliente real; recusar apenas marca o status) com geração de mensagem de WhatsApp
  (manual, via `wa.me`, na ausência de provedor oficial conectado).
- Documentação: `docs/ROADMAP_IMPLEMENTACAO_FINAL.md`, `docs/FORMULAS_FINANCEIRAS.md`,
  `HANDOFF.md` (ponto de retomada completo para qualquer IA ou desenvolvedor).
- 106 testes automatizados no total (35 novos desde o início da sessão), todos passando.

- Simulação determinística de propostas, checklist documental e pontuação explicável com decisão humana obrigatória.
- Núcleo de empréstimos com parcelas, pagamentos parciais, quitação, estorno, recibos e razão financeiro imutável.
- Contratos versionados, evidências de assinatura e bloqueio de liberação sem documento assinado.
- PIX idempotente, webhooks assinados, conciliação e devolução auditável.
- Cobrança por templates oficiais, consentimento, opt-out, horário seguro, feriados, cotas e retentativas.
- Relatórios, exportação CSV segura e portal do cliente sem exposição de dados internos.
- Assinaturas SaaS com limites, tolerância e eventos idempotentes.
- IA limitada a sugestões mascaradas e sempre sujeita à revisão humana.
- Retenção, anonimização, exportação de dados, resposta a incidentes e controles de segurança.
- API V1, aplicativo Flutter, runbook de produção e checklist final de integrações externas.
- Sessenta testes funcionais adicionais para os fluxos implementados.
