# Segurança e LGPD — Control Premium

## Princípios

- isolamento obrigatório por `tenant_id` em banco, Storage, serviços e relatórios;
- menor privilégio, MFA administrativo e sessão revogável;
- valores financeiros em centavos inteiros e lançamentos imutáveis;
- webhooks assinados, idempotentes e auditados;
- segredos somente em cofres de ambiente, nunca no código ou em logs;
- IA opcional, com dados mascarados e revisão humana;
- nenhuma decisão automática de crédito;
- nenhum dado é apagado apenas porque a assinatura SaaS foi cancelada.

## Principais ameaças e controles

| Ameaça | Controle |
|---|---|
| acesso entre empresas | RLS, chaves compostas e asserção de tenant no domínio |
| duplicidade de PIX/pagamento | chave idempotente, evento único e razão imutável |
| webhook forjado | validação da assinatura antes da leitura do evento |
| alteração silenciosa | auditoria, versão otimista e lançamentos reversíveis |
| vazamento em logs/IA | redação de segredos, mascaramento e limite de profundidade |
| cobrança abusiva | templates oficiais, consentimento, opt-out e janela de horário |
| enumeração de cadastro | mensagens públicas genéricas e tokens em hash |
| abuso de login/API | rate limit por escopo e identidade pseudonimizada |
| CSV injection | neutralização de células iniciadas por fórmula |
| redirecionamento externo | allowlist exata de origens HTTPS |

## Direitos do titular

Solicitações de acesso, correção, exportação, eliminação e oposição são registradas em
`data_subject_requests`. A identidade do solicitante deve ser verificada antes de qualquer
entrega. Retenção legal, contrato aberto e legal hold impedem exclusão automática. Quando
o registro financeiro precisa ser preservado, identificadores diretos são anonimizados.

## Retenção

Os prazos são configuração de negócio aprovada por jurídico/contabilidade, não constantes
de código. Cada categoria recebe `retention_until`, `legal_hold` e indicação de contrato
aberto. O job de descarte apenas executa a decisão registrada e gera auditoria.

## Resposta a incidentes

1. registrar o incidente e preservar evidências;
2. classificar severidade e impacto por empresa/titular;
3. conter credenciais, sessões, filas ou integrações afetadas;
4. corrigir a causa e validar o isolamento;
5. restaurar a partir de backup testado quando necessário;
6. avaliar notificações legais com assessoria responsável;
7. documentar lições, prazos e ações preventivas;
8. encerrar somente após recuperação comprovada.

## Verificações antes de produção

- teste real de RLS entre duas empresas;
- restauração de backup em ambiente isolado;
- revisão das permissões administrativas;
- teste de assinatura de todos os webhooks;
- rotação dos segredos de homologação;
- teste de rate limit, sessão e MFA;
- revisão profissional das regras financeiras e dos documentos legais;
- varredura de dependências e segredos;
- E2E de cadastro, proposta, contrato, pagamento, estorno e portal.
