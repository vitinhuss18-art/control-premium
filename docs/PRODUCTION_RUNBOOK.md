# Runbook de produção

## Ambientes

| Ambiente | Dados | Integrações | Branch |
|---|---|---|---|
| local | fictícios | adaptadores fake | `agent/*` |
| homologação | fictícios/autorizados | sandbox ou destinatários autorizados | `develop` |
| produção | reais | contas verificadas | `main` |

## Implantação

1. CI deve aprovar formatação, lint, tipos, testes, build, E2E e auditoria.
2. Aplicar migrações em homologação e executar teste de isolamento.
3. Executar backup e ensaio de restauração.
4. Publicar candidata imutável e executar smoke test.
5. Promover o mesmo artefato para produção.
6. Validar saúde, filas, webhooks, erros e métricas financeiras.
7. Manter rollback de aplicação; migrações financeiras usam correção aditiva.

## Alertas mínimos

- indisponibilidade e latência;
- falha ou atraso de filas;
- webhooks inválidos/repetidos;
- divergência do razão financeiro;
- falhas de RLS ou autorização;
- aumento de erros de login;
- backup ausente;
- custo de IA, WhatsApp, PIX e armazenamento;
- assinatura SaaS em atraso.

## Pós-implantação

- comparar totais financeiros antes e depois;
- testar login de cada perfil;
- criar e cancelar uma cobrança de homologação;
- enviar template somente a destinatário autorizado;
- conferir que o portal não revela score ou dados internos;
- registrar versão, horário, operador e resultado.
