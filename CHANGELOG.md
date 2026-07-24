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
