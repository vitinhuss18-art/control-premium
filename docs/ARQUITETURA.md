# Arquitetura inicial

## Objetivo

Transformar o protótipo do Control Premium em um SaaS multiempresa sem modificar sua identidade visual.

## Decisões

- Web: Next.js com TypeScript.
- Banco: PostgreSQL no Supabase.
- Autenticação: Supabase Auth.
- Arquivos: Supabase Storage.
- Backend inicial: Route Handlers do Next.js e serviços Supabase.
- Hospedagem: Vercel e Supabase.
- Automação: n8n após estabilização do núcleo.
- Aplicativo móvel: Flutter após estabilização da API.

## Estrutura planejada

```text
apps/
  web/
  mobile/
packages/
  ui/
  domain/
  config/
prototype/
supabase/
  migrations/
  seed/
docs/
tests/
```

`apps/mobile` fica reservado e não deve receber implementação nesta fase.

## Separação de responsabilidades

- Interface: componentes visuais sem regras financeiras.
- Domínio: regras de clientes, propostas, empréstimos, parcelas e pagamentos.
- Aplicação: casos de uso e autorização.
- Dados: acesso ao PostgreSQL e Storage.
- Integrações: PIX, WhatsApp, assinatura e IA atrás de adaptadores independentes.
- Auditoria: registro de eventos críticos no servidor.

## Multiempresa

Toda entidade de negócio deve possuir `tenant_id`. A sessão autenticada determina a empresa ativa e as
políticas RLS bloqueiam acesso cruzado. Nenhuma API pode confiar em um `tenant_id` enviado livremente pelo
navegador.

## Perfis iniciais

- Super Admin.
- Administrador.
- Gestor/Operador.
- Cobrador.
- Cliente.

As permissões serão definidas por módulo e ação e validadas tanto na interface quanto no servidor.

## Segurança

- Segredos apenas em variáveis de ambiente.
- RLS ativa nas tabelas multiempresa.
- HTTPS em todos os ambientes publicados.
- Validação de entrada no servidor.
- Logs de auditoria para ações críticas.
- Idempotência em pagamentos e webhooks.
- Dados fictícios em desenvolvimento e homologação.

## Fluxo vertical da primeira entrega

1. Usuário cria ou acessa uma empresa de teste.
2. Usuário autentica com e-mail e senha.
3. Usuário cadastra um cliente.
4. Cliente é salvo no PostgreSQL.
5. Cliente aparece no dashboard e na pesquisa.
6. Outra empresa não consegue consultar o registro.
7. Testes automatizados comprovam o isolamento.

