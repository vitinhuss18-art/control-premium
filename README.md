# Control Premium

SaaS profissional para gestão de clientes, propostas, empréstimos, parcelas, pagamentos, cobranças e automações.

## Estado

- protótipo oficial preservado;
- interface visual congelada;
- monorepo Next.js/TypeScript iniciado;
- domínio e integrações separados;
- banco multiempresa, RLS e permissões preparados por migrações;
- testes de isolamento, dados fictícios e roteiro de restauração versionados;
- testes, lint, tipos, build e CI configurados;
- conexões externas reunidas em `docs/PENDENCIAS_FINAIS.md`.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`.

## Verificações

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Consulte:

- [`docs/EXECUCAO.md`](docs/EXECUCAO.md) para ambientes e execução;
- [`docs/MODELO_DE_DADOS.md`](docs/MODELO_DE_DADOS.md) para banco e permissões;
- [`docs/BACKUP_E_RESTAURACAO.md`](docs/BACKUP_E_RESTAURACAO.md) para recuperação.
