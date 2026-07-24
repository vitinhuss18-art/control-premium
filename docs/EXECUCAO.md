# Execução da fundação

## Requisitos

- Node.js 22 ou superior;
- npm 11 ou superior;
- projeto Supabase somente quando os fluxos persistentes forem ativados.

## Instalação

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Os campos de `.env.local` podem permanecer vazios enquanto o aplicativo exibe o protótipo oficial. Credenciais reais devem ser cadastradas somente no ambiente protegido.

## Ambientes

| Ambiente    | Branch/fonte | Dados                                    | Uso             |
| ----------- | ------------ | ---------------------------------------- | --------------- |
| Local       | `agent/*`    | Fictícios                                | Desenvolvimento |
| Homologação | `develop`    | Fictícios e provedores em modo permitido | Testes          |
| Produção    | `main`       | Reais após autorização                   | Operação        |

## Qualidade

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

O teste E2E requer Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

## Supabase

As migrações ficam em `supabase/migrations`. O bucket `documents` é privado, limita arquivos a 10 MB e exige que o primeiro segmento do caminho seja o `tenant_id`.

Exemplo de caminho:

```text
<tenant_id>/clients/<client_id>/<document_id>.jpg
```

## Interface

Enquanto a migração de componentes não estiver completa e comparada visualmente, a aplicação Next.js serve uma cópia byte a byte do protótipo oficial em um `iframe`. Isso permite modernizar a infraestrutura sem redesenhar a interface.

## Integrações

PIX e WhatsApp usam contratos independentes em `packages/integrations`. Nenhum provedor é chamado até a conexão final e nenhuma credencial possui valor no repositório.
