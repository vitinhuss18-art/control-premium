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

### Segurança

- Proibição explícita de segredos no código e na documentação.
- Regra de isolamento multiempresa por `tenant_id` e RLS.
- Regra de decisão humana para crédito.
- Regra de idempotência e auditoria para operações financeiras.

### Preservado

- Identidade visual e comportamento do protótipo `ControlPremium_PROTOTIPO_OFICIAL_V1.html`.
