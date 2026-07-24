# Roadmap - Control Premium

Este roadmap segue o Plano Mestre e preserva o protótipo atual como referência oficial de interface.
Uma fase só pode ser concluída com evidência verificável: código, teste, tela validada ou documento aprovado.

## Fase 1 - Diagnóstico e escopo

- [x] Preservar o protótipo oficial.
- [x] Auditar telas, funções e armazenamento.
- [x] Classificar recursos como funcionais, parciais ou simulados.
- [x] Definir arquitetura inicial e prioridades.
- [ ] Aprovar regras de negócio ainda indefinidas.

Critério de saída: escopo do MVP aprovado.

## Fase 2 - Fundação técnica

- [x] Definir Next.js, TypeScript, PostgreSQL e Supabase como stack inicial.
- [x] Criar modelo inicial de banco versionado.
- [x] Criar padrão de variáveis de ambiente sem segredos.
- [x] Documentar arquitetura e execução.
- [ ] Criar aplicação Next.js preservando a identidade visual.
- [ ] Configurar lint, formatação, testes e integração contínua.

Critério de saída: frontend, API e banco executando em desenvolvimento.

## Fase 3 - Autenticação e multiempresa

- [ ] Configurar Supabase Auth.
- [ ] Implementar cadastro de empresa e usuário administrador.
- [ ] Implementar perfis e permissões.
- [ ] Aplicar isolamento por `tenant_id`.
- [ ] Testar que uma empresa não acessa dados de outra.

Critério de saída: autenticação e isolamento multiempresa testados.

## Fase 4 - Primeiro fluxo vertical

- [ ] Migrar login e dashboard sem alterar o design aprovado.
- [ ] Migrar cadastro, edição, pesquisa e arquivamento de clientes.
- [ ] Salvar clientes no PostgreSQL.
- [ ] Prevenir cadastros duplicados dentro da empresa.
- [ ] Registrar eventos críticos em auditoria.
- [ ] Testar o fluxo no celular e no computador.

Critério de saída: cliente persistido e isolado por empresa.

## Fase 5 - Núcleo financeiro

- [ ] Implementar propostas e aprovação registrada.
- [ ] Aprovar formalmente métodos de cálculo e arredondamento.
- [ ] Implementar empréstimos e cronogramas de parcelas.
- [ ] Implementar pagamentos totais e parciais.
- [ ] Implementar saldo devedor, atraso, estorno e quitação.
- [ ] Criar testes determinísticos para valores e datas.

Critério de saída: cálculos financeiros revisados e cobertos por testes.

## Fases posteriores

- [ ] Contratos e assinatura eletrônica.
- [ ] PIX com webhook autenticado e idempotência.
- [ ] Comunicação oficial e auditável.
- [ ] Dashboards e relatórios validados contra o banco.
- [ ] Painel seguro do cliente.
- [ ] Planos de assinatura do SaaS.
- [ ] IA responsável com revisão humana.
- [ ] Segurança, LGPD, backup e resposta a incidentes.
- [ ] Aplicativo móvel após estabilização da API.
- [ ] Piloto controlado e lançamento gradual.

## Decisões pendentes

1. Métodos de juros e amortização permitidos.
2. Regras de arredondamento.
3. Tratamento de finais de semana e feriados.
4. Regras de multa, atraso, pagamento parcial e quitação antecipada.
5. Perfis autorizados a aprovar, estornar e renegociar.
6. Provedores de assinatura eletrônica, PIX e WhatsApp.
7. Política de comunicação e horários permitidos.

