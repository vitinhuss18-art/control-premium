# HANDOFF.md - Control Premium

Ultima atualizacao: 26/07/2026. Este arquivo deve ser lido primeiro por qualquer IA ou
desenvolvedor que assuma o projeto sem contexto previo da conversa.

## 1. O que e este projeto

"Control$ Premium" (nome comercial) e um SaaS de gestao de emprestimos e vendas parceladas
para pequenos credores (emprestimo pessoal, crediario, fiado). Multiempresa (multi-tenant)
desde a fundacao.

Dono do produto: Victor (GitHub vitinhuss18-art). Se comunica em portugues, prefere
respostas curtas e diretas, e pede que qualquer sessao de trabalho nao termine com tarefa
pela metade.

## 2. Existem DUAS bases de codigo no mesmo repositorio -- nao confundir

- index.html (raiz): prototipo original, visual de referencia. Abre direto no navegador
  (arquivo unico). Mistura localStorage com chamadas reais ao Supabase (parcial). Sem
  testes automatizados. Prioridade de manutencao baixa -- e referencia visual.
- apps/web + packages/*: app real em producao, Next.js + Supabase. Precisa build/deploy
  (Vercel). 100% Supabase (banco real). 106 testes automatizados (Vitest), todos passando.
  Prioridade de manutencao alta -- e o produto real.

O index.html tambem e servido pelo app novo em /prototype.html (ver
apps/web/src/app/page.tsx) dentro de um iframe -- e a tela inicial do site publicado.

Decisao em andamento: a tela de "Propostas" (dentro do index.html) foi conectada
diretamente ao Supabase (ver secao 5) a pedido do Victor, que nao quis uma tela de admin
separada no app novo. Ou seja, o index.html deixou de ser so prototipo visual -- agora
tem uma parte funcional real. Isso e uma excecao deliberada, nao um padrao a repetir sem
necessidade.

## 3. Dominio e aplicacao (packages/) -- a parte mais solida do projeto

packages/domain/src/: logica financeira pura, sem I/O, 100% testada.

- money.ts -- valores sempre em centavos (inteiro), nunca float.
- proposal.ts -- simulateProposal(): juros simples fixo (NAO recalcula sobre saldo
  devedor), distribuicao justa de centavos entre parcelas, datas com dias uteis/feriados,
  score de credito explicavel que nunca decide sozinho (requiresHumanDecision: true
  travado no tipo).
- installmentSale.ts -- Venda Parcelada: reaproveita simulateProposal() inteiro, so
  adiciona produto/descricao/foto/entrada. Valor financiado = preco menos entrada.
- operationalCost.ts -- custo operacional (repasse configuravel por empresa: percentual ou
  valor fixo), distribuido nas parcelas com a mesma tecnica de arredondamento justo.
- loan.ts -- alocacao de pagamento (parcela mais antiga primeiro), saldo devedor.
- contract.ts, client.ts, permissions.ts, privacy.ts (LGPD), reporting.ts,
  subscription.ts, tenant.ts.

packages/application/src/: orquestracao (usa o domain + persistencia).

- proposals.ts -- cria proposta com "simulation" congelada uma unica vez (nunca
  recalculada depois -- e a garantia estrutural de que proposta = contrato = parcelas).
- loans.ts -- cria emprestimo a partir de proposta aprovada, usando so os valores ja
  congelados. assertFinancialConsistency() roda depois de cada pagamento/reversao.
- contracts.ts, pix.ts (idempotencia, valida webhook por assinatura), messaging.ts
  (servico pronto para quando houver provedor real de WhatsApp -- ver secao 7),
  security.ts, subscriptions.ts, invitations.ts, clients.ts, ai.ts, portal.ts.

Todos os testes ficam em packages/*/tests/. Rodar com `npm test` na raiz.

## 4. Banco de dados (Supabase) -- estado real, nao confiar em "sucesso" sem checar

Projeto Supabase real do Victor: https://ymayqjphgwvxekgxxolt.supabase.co
(painel: https://supabase.com/dashboard/project/ymayqjphgwvxekgxxolt)

IMPORTANTE -- licao aprendida nesta sessao: Victor as vezes confirma "sucesso" sem
verificar de fato. Ja aconteceu de uma migracao nunca ter sido aplicada de verdade mesmo
com "sucesso" confirmado antes. Sempre que houver duvida sobre o estado real do banco,
peca para rodar:

    select tablename from pg_tables where schemaname = 'public' order by tablename;

e compare com as migracoes em supabase/migrations/.

Migracoes existentes (ordem de aplicacao, todas com if not exists / create or replace
onde possivel):

1. 202607240001_foundation.sql -- tenants, profiles, clients, audit_logs, RLS base.
2. 202607240002_storage.sql -- bucket documents, politicas.
3. 202607240003_roles.sql -- adiciona role manager.
4. 202607240004_domain_schema.sql -- todo o schema de negocio (propostas, emprestimos,
   parcelas, pagamentos, PIX, contratos, notificacoes, SaaS plans).
5. 202607240005_auth_and_permissions.sql -- role_permissions, bootstrap_tenant(),
   accept_member_invitation(), protecao de privilegios em profiles.
6. 202607250001_finance_automation_and_compliance.sql -- record_loan_payment(),
   reverse_loan_payment() (ambas com ledger imutavel), LGPD, incidentes de seguranca.
7. 202607250002_client_signup_links.sql -- link de convite (create_client_signup_link(),
   register_client_via_link() -- esta ultima hoje NAO e usada, foi uma primeira tentativa
   substituida pelo fluxo de client_proposals, ver item 8/9).
8. 202607250003_client_proposals.sql -- autoria: Codex (ver secao 6). Tabela
   client_proposals (staging pre-cliente) + bucket client-documents.
9. 202607250004_validate_signup_token.sql -- autoria: Codex. Versao original, ja
   corrigida pela migracao seguinte.
10. 202607250005_secure_client_proposals.sql -- corrige falha de seguranca real do
    Codex: a politica de insert em client_proposals nao validava o token de verdade
    (qualquer um com a chave anonima podia inserir proposta falsa). Tambem remove
    politica de storage aberta demais.
11. 202607250006_installment_sale.sql -- operation_type em credit_proposals/loans.
12. 202607250007_operational_costs.sql -- config de custo operacional em tenants.
13. 202607260001_proposal_decisions.sql -- CONFIRMADO 28/07/2026 (ver abaixo). Adiciona
    client_id/frequency/installment_count/periodic_interest_bps em client_proposals,
    whatsapp_business_number em tenants, e as funcoes decide_client_proposal() e
    connect_tenant_whatsapp().
14. 202607260002_client_login_by_cpf.sql -- login de cliente real por CPF + quatro
    ultimos digitos do WhatsApp. Remove a assinatura anterior que aceitava somente CPF
    e recusa credenciais ambiguas entre tenants.
18. 202607280001_create_loan.sql -- CONFIRMADO 28/07/2026 (sessao seguinte). Ver
    "DESCOBERTA 28/07/2026" logo abaixo -- essa e a peca mais importante de todas as
    migracoes ate agora.
19. 202607280002_fix_signup_link_rls_check.sql -- AINDA NAO CONFIRMADO COMO APLICADO por
    Victor. Corrige bug critico: NENHUMA proposta anonima (fluxo /cadastro) conseguia ser
    registrada desde a migration 13 (250005), porque a policy de insert em
    client_proposals fazia EXISTS numa subquery contra client_signup_links, que tem RLS
    sem policy de select pro anon -- a subquery sempre via zero linhas, EXISTS sempre
    falso, insert sempre barrado. Trocado por funcao security definer
    signup_link_is_active(). PRECISA SER APLICADA E TESTADA antes de qualquer outro teste
    do fluxo de cadastro.

CONFIRMADO 28/07/2026 (migration 18): na primeira tentativa de checar, a query de
policies trouxe nomes como credit_proposals_select_same_tenant,
credit_proposals_insert_staff etc. -- nomes que NAO existem em nenhuma migration do
repositorio. Ou seja, a migration 18 nunca tinha sido aplicada de fato (nem a funcao nem
as policies dela existiam -- o que estava la vinha de outro lugar, provavelmente o Codex
mexendo direto no SQL Editor sem deixar migration commitada, reforca o alerta da secao 6).
Reaplicada a migration inteira (sem conflito de nomes) e confirmado via:

    select routine_name from information_schema.routines
    where routine_schema = 'public' and routine_name = 'create_loan_with_installments';
    -- retornou 1 linha

    select policyname from pg_policies
    where schemaname = 'public'
      and policyname in ('credit_proposals_select_staff', 'loans_select_staff',
        'installments_select_staff', 'payments_select_staff');
    -- retornou as 4 linhas

Licao reforcada: "sucesso"/"Success. No rows returned" no SQL Editor NAO confirma que uma
migration de CREATE POLICY/CREATE FUNCTION rodou como esperado -- so confirma que nao deu
erro de sintaxe. Sempre pedir o resultado de uma query de verificacao que busque pelo nome
exato do objeto esperado.

CONFIRMADO 28/07/2026: Victor rodou a query abaixo no SQL Editor do Supabase e as 5
funcoes retornaram -- migracoes 13 a 17 estao aplicadas de verdade no banco real
(decide_client_proposal, connect_tenant_whatsapp, client_login_by_cpf,
consume_login_rate_limit, reset_login_rate_limit). Nao verificado por mim diretamente
(sem rota de rede ate *.supabase.co), confiando na confirmacao com print/resultado da
query, que e o padrao aceitavel descrito nesta secao.

Query usada (fica registrada aqui caso precise confirmar de novo no futuro apos novas
migracoes):

    select routine_name from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'decide_client_proposal', 'connect_tenant_whatsapp', 'client_login_by_cpf',
        'consume_login_rate_limit', 'reset_login_rate_limit'
      );

DESCOBERTA 28/07/2026 (importante -- leia isso antes de trabalhar em Dashboard, Venda
Parcelada ou qualquer coisa que dependa de emprestimos existirem de verdade):

Ate esta sessao, NENHUMA funcao no banco real inserta em credit_proposals. A tabela
loans exige um proposal_id que vem de credit_proposals -- entao, na pratica, nunca
existiu um jeito de um emprestimo nascer de verdade no banco, mesmo com todo o motor de
calculo (packages/domain) pronto e testado. decide_client_proposal() so cria o registro
em clients; nunca criou loan nem installments. Alem disso, RLS estava ligado em
credit_proposals/loans/installments/payments desde a fundacao, mas sem NENHUMA policy --
ou seja, nem o proprio admin do tenant conseguia ler essas tabelas.

Corrigido pela migration 202607280001_create_loan.sql:
- Policies de select (staff do proprio tenant) para credit_proposals, loans,
  installments, payments.
- Funcao create_loan_with_installments(): cria credit_proposals + loans + installments
  atomicamente. Recebe as parcelas JA CALCULADAS (nao recalcula juros/datas em SQL --
  decisao deliberada pra nao duplicar a logica financeira testada em
  packages/domain/src/proposal.ts, ver comentario no topo da propria migration).

O calculo em si acontece numa rota nova do apps/web (Next.js, que consegue importar
packages/domain -- o index.html nao consegue, e HTML/JS solto sem build):
apps/web/src/app/api/admin/loans/route.ts. Recebe o token de acesso do admin logado
(Authorization: Bearer <access_token>, pego do window.supabaseClient.auth.getSession()
no index.html), chama simulateProposal() ou simulateInstallmentSale() do domain, e so
entao chama a RPC create_loan_with_installments() usando um client Supabase autenticado
como o proprio admin (a RPC checa role_has_permission('proposals.approve') via
auth.uid(), igual as outras).

UI nova no index.html: card "💰 Empréstimo real (Supabase)" dentro da tela Contratos
(id="contratos"), separado da calculadora de demonstracao que ja existia ali (essa
continua so local/localStorage, nao mexi nela). O card novo carrega clientes reais da
tabela clients, deixa escolher emprestimo comum ou venda parcelada, e chama
/api/admin/loans de verdade.

Validado local (npm test 106/106, typecheck, lint, build todos limpos) -- NUNCA testado
contra o banco real. Falta:
1. Confirmar a migration 202607280001 aplicada (mesmo processo da secao 4).
2. Testar de ponta a ponta: aprovar um cliente -> Contratos -> Empréstimo real -> conferir
   se aparece certinho no /cliente do cliente logado.

PROXIMA ACAO: migration 202607280001_create_loan.sql confirmada aplicada (ver acima).
Falta testar o fluxo completo (aprovacao -> criar emprestimo real -> /cliente mostrando os
dados) -- isso ainda NAO foi feito contra o banco real.

Nesta sessao (28/07/2026), Victor gerou um GitHub fine-grained token com escopo so deste
repo (Contents + Pull requests: read/write) pra eu poder commitar e dar push sozinho, sem
pedir confirmacao a cada passo. O token foi configurado localmente no remote git (nao fica
salvo em nenhum arquivo do repositorio). Continuo sem qualquer acesso de rede ao Supabase
-- isso nao mudou e nao da pra contornar por aqui.

Chave publica (segura para expor no client-side, ja usada em index.html e em
apps/web/src/app/cadastro):

    NEXT_PUBLIC_SUPABASE_URL=https://ymayqjphgwvxekgxxolt.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_l3fdH2Nd_U2CyRvS1GFhkw_g3ceVXxh

A service_role key (secreta) so existe no ambiente da Vercel (variavel
SUPABASE_SERVICE_ROLE_KEY, configurada por Victor diretamente la) -- nunca deve aparecer
neste repositorio nem em conversa.

## 5. Fluxo completo do link de cadastro (o que ja funciona ponta a ponta)

1. Assinante (admin), na tela Cadastrar do index.html, clica em "Enviar link" ->
   enviarLinkWhatsApp() chama create_client_signup_link() (RPC) -> gera link tipo
   https://SITE/cadastro?token=...
2. Cliente abre o link -> apps/web/src/app/cadastro/page.tsx -> preenche nome, CPF,
   Instagram, PIX, WhatsApp, SMS, endereco, regiao, valor desejado, 4 fotos/documentos.
3. Envio vai para apps/web/src/app/api/cadastro/route.ts (rota server-side, usa
   service_role key) -> valida token via validate_signup_link_token() -> insere em
   client_proposals (status pending) -> sobe os 4 arquivos para o bucket
   client-documents, caminho {tenant_id}/proposals/{proposal_id}/{campo}.
4. Admin abre a tela Propostas no index.html -> carregarPropostasExternas() (dentro do
   proprio index.html) -> se nao estiver autenticado via Supabase Auth, mostra
   formulario de login/criar-empresa embutido ali mesmo -> lista as propostas
   pendentes do tenant.
5. Admin define frequencia/parcelas/juros e aprova (ou recusa) ->
   decidirPropostaExterna() chama a RPC decide_client_proposal():
   - Se aprovado: cria a linha real em clients e marca a proposta como aprovada.
   - Se recusado: so marca o status, nao apaga nada de verdade.
6. Gera mensagem de WhatsApp (aprovado: boas-vindas + link do app; recusado: "tente
   novamente em 7 dias") com botao que abre wa.me/... -- envio ainda e manual (o admin
   clica e manda), porque nao existe provedor oficial de WhatsApp conectado (ver secao 7).
7. O cliente aprovado entra informando CPF e os quatro ultimos digitos do WhatsApp.
   A RPC client_login_by_cpf() consulta o Supabase, devolve somente nome/status e recusa
   combinacoes ambiguas entre tenants.

## 6. Codex -- outro agente de IA trabalhando no mesmo repositorio

Durante esta sessao descobrimos que Victor tambem usa (ou usava) o Codex (OpenAI) para
trabalhar neste mesmo repositorio, de forma autonoma, via um "Roteiro de Execucao"
(docs/ROTEIRO_EXECUCAO_CONTROL_PREMIUM.md -- nao escrito por mim, ler se precisar de mais
contexto historico). Os commits do Codex aparecem como autor "Control Premium Bot".

Isso ja causou duplicacao de esforco uma vez (dois agentes construindo o mesmo fluxo de
cadastro por link ao mesmo tempo, com migracoes de nomes colidentes). Antes de assumir que
voce e o unico editando o repositorio, rode `git log --oneline -20` e confira os autores
dos commits mais recentes. Se aparecer "Control Premium Bot" em commits recentes, avise
Victor antes de continuar -- pode haver outro agente ativo em paralelo.

Em 26/07/2026 Victor disse "vai ser so voce agora" (referindo-se a mim, Claude), mas isso
nao e garantia de que o Codex esta de fato desligado -- e uma instrucao, nao um fato
tecnico verificavel por mim.

## 7. Integracoes pendentes (decisoes que so Victor pode tomar)

Ver docs/FINAL_EXTERNAL_CHECKLIST.md e docs/CHECKLIST_LANCAMENTO.md para a lista
completa. Resumo do que bloqueia o que:

- WhatsApp Business oficial: sem isso, packages/application/src/messaging.ts
  (ja pronto, so precisa de um WhatsAppProvider real) nao pode enviar nada de verdade.
  Hoje tudo e wa.me manual (o admin clica um botao e manda ele mesmo).
- PIX: packages/application/src/pix.ts ja tem toda a logica de idempotencia e
  validacao de webhook pronta -- falta escolher provedor e configurar credenciais.
- Dominio proprio: hoje o site roda em control-premium-web.vercel.app (dominio gratis
  da Vercel). Registrar dominio proprio e decisao/custo do Victor.
- Assinatura eletronica de contrato, contas de desenvolvedor das lojas: nao iniciado.

## 8. Bugs conhecidos / dividas tecnicas

- O login real ainda precisa de rate limit no gateway antes de exposicao em producao.
- register_client_via_link() (migracao 7) e codigo morto -- substituido pelo fluxo de
  client_proposals. Nao atrapalha, mas pode ser removido num cleanup futuro.
- Nenhum teste automatizado cobre o index.html (e HTML/JS solto, sem framework de teste).
  Toda mudanca nele precisa ser validada manualmente rodando node --check no JS extraido
  (ver padrao usado nos commits desta sessao) antes de commitar.
- apps/web ainda nao tem Dashboard, Agenda, nem tela de Cobrador -- so a landing publica
  de cadastro. A interface "de verdade" do admin ainda vive dentro do index.html.
- O modelo de juros e simples/fixo (calculado uma vez). Se no futuro Victor pedir
  recalculo sobre saldo devedor (tipo Price/SAC), isso exige mudanca de schema -- ver
  docs/FORMULAS_FINANCEIRAS.md, secao 8, para o que precisa ser decidido antes.

## 9. Roadmap -- proximos passos, em ordem de dependencia

1. Confirmar que as migracoes 13 a 17 foram aplicadas de verdade (ver secao 4 e a query
   pronta la).
2. Testar o fluxo completo ponta a ponta: link -> proposta -> aprovacao -> cliente criado
   -> login do cliente -> /cliente mostrando os emprestimos (rota /cliente ja construida
   em 28/07/2026: apps/web/src/app/cliente/page.tsx + apps/web/src/app/api/cliente/*,
   sessao do cliente via cookie httpOnly assinado, ver commit "feat: rota /cliente de
   verdade no apps/web"). Falta validar isso contra o banco real -- so rodou local com
   npm test/typecheck/build, nunca contra dados reais.
3. [FEITO 28/07/2026, commit c8718c6] connect_tenant_whatsapp() agora tem UI real: card
   "WhatsApp da Empresa" na tela de Configuracoes (index.html, id="painel"), com input +
   botao "Conectar", chama a RPC via window.supabaseClient.rpc(), mostra o numero
   conectado ao reabrir a tela (le tenants.whatsapp_business_number via
   profiles.tenant_id, respeitando a RLS tenants_select_same_tenant). Validado so com
   node --check (sem framework de teste pro index.html, ver secao 10) -- AINDA NAO
   TESTADO contra o banco real, precisa validar clicando de verdade no site publicado.
4. Retomar os itens do docs/ROADMAP_IMPLEMENTACAO_FINAL.md (Dashboard, Agenda, Cobrador,
   tipo de operacao escolhivel antes do contrato).
5. Quando Victor decidir provedor de PIX/WhatsApp: plugar credenciais reais nos servicos
   ja prontos em packages/application.

## 10. Como validar qualquer mudanca antes de comitar (checklist minimo)

    npm test              # 106 testes devem passar
    npm run typecheck      # 0 erros em todos os pacotes
    npm run lint           # 0 erros (1 warning pre-existente sobre <img> e aceitavel)
    npm run build          # build de producao do apps/web precisa compilar

Para mudancas no index.html (arquivo solto, sem tooling), validar sintaxe JS assim:

    python3 -c "
    import re
    html = open('index.html', encoding='utf-8').read()
    blocks = [m.group('body') for m in re.finditer(r'<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>', html, re.DOTALL) if 'src=' not in m.group('attrs')]
    open('/tmp/check.js','w',encoding='utf-8').write(chr(10).join(blocks))
    "
    node --check /tmp/check.js

Cuidado com quebra de linha (CRLF): index.html usa \r\n na maior parte do arquivo.
Editar com ferramentas que normalizam para \n causa diffs gigantes e ruidosos. Sempre
conferir `git diff --stat` depois de editar esse arquivo -- se o numero de linhas
alteradas for muito maior que o esperado, e sinal de que a quebra de linha foi mexida
sem necessidade.

## 11. Como aplicar uma migracao nova no Supabase (processo manual, sem CLI)

Victor nao tem a Supabase CLI instalada e prefere copiar/colar. O processo e:

1. Mostrar o SQL completo da migracao num bloco de codigo.
2. Pedir para colar no SQL Editor do Supabase
   (https://supabase.com/dashboard/project/ymayqjphgwvxekgxxolt/sql/new) e clicar em "Run".
3. Pedir confirmacao explicita do resultado (idealmente um print, ja que "sucesso" verbal
   nem sempre e confiavel -- ver secao 4).
4. Se der erro, ler a mensagem com atencao -- varias vezes nesta sessao o erro apontava um
   problema real de SQL (ex: WITH contendo UPDATE aninhado em subquery, ou tentar mudar
   o tipo de retorno de uma funcao so com CREATE OR REPLACE, que o Postgres nao permite).

## 12. Preferencias de comunicacao do Victor (importante manter)

- Portugues, direto, sem enrolacao.
- Prefere confirmar passo a passo antes de acoes grandes (ja pediu isso explicitamente).
- Pediu para nunca terminar uma sessao com tarefa pela metade.
- Pediu para, em sessao nova, sempre recapitular onde a ultima sessao parou antes de
  continuar (e basicamente o proposito deste arquivo).
- As vezes confunde qual "app" esta sendo discutido (index.html vs apps/web) -- sempre
  que uma instrucao for ambigua nesse sentido, vale a pena confirmar antes de construir
  algo grande, para nao ter que refazer.
