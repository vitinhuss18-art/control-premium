# Roadmap executivo — Control Premium

Atualizado em: 24/07/2026  
Fonte detalhada: [`docs/ROTEIRO_EXECUCAO_CONTROL_PREMIUM.md`](docs/ROTEIRO_EXECUCAO_CONTROL_PREMIUM.md)

## Objetivo

Transformar o protótipo visual aprovado em um SaaS web e aplicativos Android/iPhone, preservando a interface e substituindo simulações por serviços reais, seguros e auditáveis.

## Regras de execução

- A interface aprovada não será redesenhada sem autorização explícita.
- Cada mudança será feita em branch própria e revisada por pull request.
- Nenhuma senha, token, chave PIX, certificado ou segredo será incluído no repositório.
- PIX e WhatsApp usarão contas reais e verificadas de titular elegível ou responsável legal autorizado; os primeiros testes serão limitados à homologação do provedor e a destinatários autorizados.
- Recursos financeiros não entrarão em produção sem regras aprovadas, idempotência, auditoria e testes determinísticos.
- A IA nunca decidirá crédito sozinha.

## Marcos

| Bloco | Entrega | Estado |
|---|---|---|
| A | Proteção do projeto, inventário e escopo congelado | Aprovado; ruleset final pendente |
| B | Contas reais de PIX e WhatsApp conectadas e validadas | Preparada; conexões finais pendentes |
| C | Fundação Next.js/TypeScript/Supabase | Concluída tecnicamente |
| D | Banco multiempresa e RLS | Concluído tecnicamente; aplicação no Supabase real pendente |
| E | Autenticação e permissões | Base técnica concluída; MFA e testes reais pendentes |
| F | Interface migrada fielmente | Protótipo oficial preservado; conexão completa aos fluxos reais pendente |
| G | Primeiro fluxo real de clientes | Domínio concluído; persistência real pendente |
| H | Cadastro por link e WhatsApp | Base segura concluída; envio real pendente |
| I | Propostas e análise | Concluído tecnicamente |
| J | Núcleo financeiro | Concluído tecnicamente |
| K | Contratos e assinatura | Concluído tecnicamente; provedor real pendente |
| L | PIX e conciliação | Concluído tecnicamente; conta e homologação pendentes |
| M | Cobrança por WhatsApp | Concluído tecnicamente; templates e conta pendentes |
| N | Dashboard, relatórios e portal | Domínio, relatórios e portal seguro concluídos tecnicamente |
| O | Assinatura do SaaS | Concluído tecnicamente; provedor real pendente |
| P | IA responsável | Concluído tecnicamente; provedor e orçamento pendentes |
| Q | Segurança, LGPD e qualidade | Controles técnicos concluídos; validações profissionais pendentes |
| R | Aplicativos Android e iPhone | Estrutura Flutter concluída; builds e lojas pendentes |
| S | Produção, lançamento e operação | Runbooks concluídos; infraestrutura e publicação pendentes |

## Próximo marco

Conectar o Supabase e os provedores escolhidos no ambiente protegido, validar as regras jurídicas e financeiras e executar homologação antes da publicação em produção.
