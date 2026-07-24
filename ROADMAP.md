# Roadmap executivo — Control Premium

Atualizado em: 24/07/2026  
Fonte detalhada: [`docs/ROTEIRO_EXECUCAO_CONTROL_PREMIUM.md`](docs/ROTEIRO_EXECUCAO_CONTROL_PREMIUM.md)

## Objetivo

Transformar o protótipo visual aprovado em um SaaS web e aplicativos Android/iPhone, preservando a interface e substituindo simulações por serviços reais, seguros e auditáveis.

## Regras de execução

- A interface aprovada não será redesenhada sem autorização explícita.
- Cada mudança será feita em branch própria e revisada por pull request.
- Nenhuma senha, token, chave PIX, certificado ou segredo será incluído no repositório.
- PIX e WhatsApp usarão contas reais e verificadas do proprietário; os primeiros testes serão limitados à homologação do provedor e a destinatários autorizados.
- Recursos financeiros não entrarão em produção sem regras aprovadas, idempotência, auditoria e testes determinísticos.
- A IA nunca decidirá crédito sozinha.

## Marcos

| Bloco | Entrega | Estado |
|---|---|---|
| A | Proteção do projeto, inventário e escopo congelado | Aprovado; ruleset final pendente |
| B | Contas reais de PIX e WhatsApp conectadas e validadas | Preparada; conexões finais pendentes |
| C | Fundação Next.js/TypeScript/Supabase | Concluída tecnicamente |
| D | Banco multiempresa e RLS | Pendente |
| E | Autenticação e permissões | Pendente |
| F | Interface migrada fielmente | Pendente |
| G | Primeiro fluxo real de clientes | Pendente |
| H | Cadastro por link e WhatsApp | Pendente |
| I | Propostas e análise | Pendente |
| J | Núcleo financeiro | Pendente |
| K | Contratos e assinatura | Pendente |
| L | PIX e conciliação | Pendente |
| M | Cobrança por WhatsApp | Pendente |
| N | Dashboard, relatórios e portal | Pendente |
| O | Assinatura do SaaS | Pendente |
| P | IA responsável | Pendente |
| Q | Segurança, LGPD e qualidade | Pendente |
| R | Aplicativos Android e iPhone | Pendente |
| S | Produção, lançamento e operação | Pendente |

## Próximo marco

Após a aprovação do Bloco A, iniciar o Bloco B com a seleção dos provedores oficiais de PIX e WhatsApp. As conexões que exigirem identidade, aceite contratual ou credenciais serão realizadas pelo titular em painel protegido.
