# Control Premium

SaaS profissional para gestão de clientes, propostas, empréstimos, parcelas, pagamentos, cobranças e automações.

## Estado

- protótipo oficial e identidade visual preservados;
- monorepo Next.js/TypeScript com domínio e integrações separados;
- banco multiempresa, RLS, razão financeiro imutável e operações atômicas preparados por migrações;
- clientes, cadastro por link, propostas, análise humana, contratos, empréstimos, pagamentos, estornos e quitação implementados;
- adaptadores para PIX, assinatura eletrônica, WhatsApp oficial, cobrança do SaaS e IA assistiva definidos sem segredos;
- relatórios, portal seguro do cliente, retenção LGPD, anonimização, auditoria e proteção contra abuso implementados;
- API V1 preparada para clientes web e móveis;
- aplicativo Flutter para Android e iPhone iniciado com a identidade visual oficial;
- runbook de produção e checklist das conexões externas documentados;
- 60 testes funcionais adicionais cobrem os novos fluxos;
- conexões que exigem contas, credenciais ou validação profissional permanecem reunidas em `docs/PENDENCIAS_FINAIS.md`.

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
- [`docs/BACKUP_E_RESTAURACAO.md`](docs/BACKUP_E_RESTAURACAO.md) para recuperação;
- [`docs/SECURITY_AND_LGPD.md`](docs/SECURITY_AND_LGPD.md) para segurança e privacidade;
- [`docs/API_V1_AND_MOBILE.md`](docs/API_V1_AND_MOBILE.md) para o contrato de API e aplicativo móvel;
- [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md) para implantação e operação;
- [`docs/FINAL_EXTERNAL_CHECKLIST.md`](docs/FINAL_EXTERNAL_CHECKLIST.md) para o fechamento com serviços reais.
