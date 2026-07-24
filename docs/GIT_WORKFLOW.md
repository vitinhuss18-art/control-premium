# Fluxo Git e proteção do projeto

## Branches

| Branch | Uso | Regra |
|---|---|---|
| `main` | Versão oficial aprovada | Recebe somente entregas aprovadas |
| `develop` | Integração de desenvolvimento | Recebe somente pull requests revisados |
| `agent/*` | Mudança isolada | Uma entrega ou correção por branch |

## Fluxo

1. Criar `agent/<descricao>` a partir da base definida.
2. Alterar somente arquivos do escopo.
3. Executar testes e verificações.
4. Abrir pull request em modo rascunho.
5. Publicar a prévia quando houver mudança executável.
6. Receber aprovação do proprietário.
7. Atualizar roteiro e changelog.
8. Incorporar a entrega aprovada.

## Proteções obrigatórias

- não realizar trabalho normal diretamente em `main` ou `develop`;
- não usar push forçado;
- exigir pull request;
- exigir testes aplicáveis;
- impedir merge com segredos ou falhas críticas;
- manter histórico de aprovação;
- remover branches temporárias após incorporação quando for seguro;
- revisar alterações de banco, autenticação e finanças com atenção reforçada.

## Estado da proteção

A branch `develop` foi criada. A proteção operacional por pull request passa a valer imediatamente para todo trabalho do Codex. A proteção de servidor por ruleset do GitHub permanece como requisito de administração do repositório e não deve ser declarada concluída até existir prova verificável da configuração.

## Segredos

Nunca incluir:

- senhas;
- tokens;
- chaves de API;
- certificados;
- códigos de verificação;
- credenciais bancárias;
- valores reais de arquivos `.env`.

O repositório conterá somente nomes de variáveis em `.env.example`. Valores serão inseridos pelo titular nos painéis protegidos dos provedores e dos ambientes.
