# Pendências finais do proprietário

Este arquivo reúne somente ações que o Codex não pode concluir sem uma conta externa, verificação de identidade, aceite contratual, segredo, pagamento ou decisão profissional. Nenhum desses itens deve interromper a construção das partes independentes do aplicativo.

## GitHub

- aplicar e comprovar ruleset de servidor na branch `develop`;
- exigir pull request e bloquear push forçado quando o recurso estiver disponível.

## PIX

- escolher o provedor final após comparação de API, homologação, webhook, idempotência, suporte e custo;
- conectar uma conta real e verificada de titular elegível ou responsável legal autorizado;
- aceitar contratos e verificações exigidos pelo provedor;
- cadastrar credenciais somente no painel protegido;
- autorizar o teste final com movimentação real.

## WhatsApp

- escolher o provedor oficial;
- conectar e verificar a conta e o número comercial por titular elegível ou responsável legal autorizado;
- aprovar templates;
- cadastrar token e identificadores no ambiente protegido;
- autorizar os destinatários dos primeiros testes.

## Infraestrutura

- registrar ou conectar o domínio;
- conectar um projeto Supabase por titular elegível ou responsável autorizado;
- manter as próximas migrações versionadas e executar o teste real de isolamento
  multiempresa; `202608050001_atomic_client_proposal.sql` foi aplicada e verificada em
  06/08/2026;
- opcionalmente cadastrar `CLIENT_SESSION_SECRET` com pelo menos 32 caracteres no cofre
  da hospedagem; sem ela, o servidor deriva uma chave exclusiva da credencial já
  protegida;
- configurar e-mail/SMS de confirmação, recuperação de senha, sessões e MFA no Supabase Auth;
- executar e comprovar um teste real de backup e restauração em ambiente isolado;
- conectar hospedagem e provedor de e-mail;
- cadastrar variáveis protegidas nos ambientes;
- aprovar custos que não possam operar no plano gratuito.

## Jurídico, contábil e privacidade

- revisar contrato, termos e política de privacidade;
- aprovar juros, amortização, arredondamento, atraso, quitação e renegociação;
- validar mensagens e horários de cobrança;
- validar emissão fiscal, tributos, retenção e bases legais;
- definir responsáveis por suporte e incidentes.

## Distribuição

- conectar contas de desenvolvedor Google Play e Apple;
- aceitar contratos das lojas;
- concluir verificações e pagamentos exigidos;
- aprovar materiais finais e publicação.

## Regra de segurança

Senhas, tokens, códigos de verificação, certificados e dados bancários não serão solicitados no chat nem armazenados no GitHub.
