# Roteiro oficial de execução - Control Premium

Versão: 1.1  
Data inicial: 24/07/2026  
Repositório: `vitinhuss18-art/control-premium`  
Regra principal: a interface visual atual deve ser preservada. Alterações visuais somente poderão ser feitas mediante autorização explícita do proprietário.

## 1. Objetivo deste documento

Este arquivo é o roteiro operacional único para transformar o protótipo Control Premium em um aplicativo funcional para web, Android e iPhone.

O trabalho seguirá uma sequência numerada. O Codex ficará responsável por arquitetura, código, testes, documentação e envio das entregas corretas ao GitHub. O proprietário ficará responsável somente por decisões de negócio e conexões que exigem conta própria, verificação de identidade, aceite contratual, credenciais ou pagamento.

Nenhuma chave, token, senha, certificado ou segredo deverá ser enviado em conversa, commit ou arquivo público. Segredos serão cadastrados diretamente nos painéis dos provedores e nas variáveis protegidas dos ambientes.

## 2. Regras permanentes

1. Não editar a identidade visual nem redesenhar a interface atual.
2. Preservar o HTML original como referência imutável.
3. Reconstruir o produto em arquitetura profissional, sem aumentar o HTML monolítico.
4. Executar uma etapa por vez.
5. Só marcar uma etapa como concluída depois de código, teste ou prova verificável.
6. Salvar no GitHub cada entrega aprovada e validada.
7. Não salvar segredos no GitHub.
8. Usar dados fictícios durante desenvolvimento e homologação.
9. Conectar a conta PIX real do proprietário desde o início, usando primeiro o modo de homologação do próprio provedor quando disponível; movimentar dinheiro somente no teste final autorizado.
10. Conectar a conta e o número reais de WhatsApp do proprietário desde o início; limitar os primeiros envios ao proprietário e aos destinatários de teste autorizados.
11. Não permitir acesso entre empresas diferentes.
12. Não permitir que IA aprove ou negue crédito sozinha.
13. Registrar todas as alterações financeiras e ações sensíveis em auditoria.
14. Manter `ROADMAP.md`, `CHANGELOG.md` e `ARQUITETURA.md` atualizados.
15. Toda conexão financeira ou empresarial deve usar conta verificada do titular ou responsável legal autorizado.

## 3. Definição de concluído

Uma etapa somente estará concluída quando:

- o código estiver completo;
- os testes correspondentes passarem;
- nenhum segredo estiver no repositório;
- a documentação estiver atualizada;
- houver registro no GitHub;
- o funcionamento estiver comprovado em ambiente adequado;
- as pendências externas estiverem identificadas claramente.

## 4. Responsabilidades

### Codex

- produzir código e migrações;
- criar testes;
- revisar segurança;
- documentar execução;
- preservar a interface;
- preparar integrações;
- salvar entregas corretas no GitHub;
- informar exatamente quando uma ação externa for necessária.

### Proprietário

- conectar e verificar contas;
- escolher e contratar provedores quando necessário;
- inserir segredos diretamente nos painéis protegidos;
- aprovar regras de juros, cobrança, feriados e renegociação;
- providenciar revisões contábil e jurídica;
- testar acessos que exigem telefone, banco ou confirmação pessoal.

## 5. Roteiro numerado do início ao aplicativo completo

### Bloco A - Proteção do projeto e inventário

1. ~~Preservar `ControlPremium(3).html` como protótipo oficial imutável.~~ ✅ Aprovado em 24/07/2026.
2. Criar branch de desenvolvimento protegida. 🟡 Branch `develop`, fluxo PR-only e `CODEOWNERS` criados; ruleset de servidor registrado para a lista final.
3. ~~Criar `ROADMAP.md`, `CHANGELOG.md`, `ARQUITETURA.md` e este roteiro.~~ ✅ Aprovado em 24/07/2026.
4. ~~Registrar todas as telas existentes sem alterar a interface.~~ ✅ Aprovado em 24/07/2026.
5. ~~Registrar todas as funções que funcionam localmente.~~ ✅ Aprovado em 24/07/2026.
6. ~~Registrar funções parciais e funções simuladas.~~ ✅ Aprovado em 24/07/2026.
7. ~~Registrar dados fictícios e dependências de `localStorage`.~~ ✅ Aprovado em 24/07/2026.
8. ~~Definir o MVP comercial da primeira versão.~~ ✅ Aprovado em 24/07/2026.
9. ~~Separar MVP de recursos futuros.~~ ✅ Aprovado em 24/07/2026.
10. ~~Registrar dúvidas de negócio que impedem cálculos ou automações.~~ ✅ Aprovado em 24/07/2026.

Marco A: aprovado em 24/07/2026, com a aplicação do ruleset de servidor mantida na lista final de pendências externas.

### Bloco B - Primeiras conexões usando as contas reais do proprietário

11. Escolher provedor PIX com API, homologação, webhook, idempotência e documentação.
12. Proprietário conectar sua conta PIX real e verificada.
13. ~~Codex criar apenas os nomes das variáveis PIX em `.env.example`, sem valores.~~ ✅ Concluído em 24/07/2026.
14. Proprietário cadastrar as credenciais PIX no ambiente protegido.
15. Codex testar a integração com a conta real do proprietário, começando pelo modo de homologação do provedor quando disponível e sem cobrança a clientes.
16. Escolher provedor oficial de WhatsApp Business/API.
17. Proprietário conectar e verificar sua conta e seu número real de WhatsApp.
18. ~~Codex criar apenas os nomes das variáveis WhatsApp em `.env.example`.~~ ✅ Concluído em 24/07/2026.
19. Proprietário cadastrar token, número e identificadores no ambiente protegido.
20. Codex testar uma mensagem de template usando a conta real, enviando inicialmente somente ao número do proprietário ou a destinatário de teste autorizado.
21. Definir domínio, e-mail transacional, hospedagem e banco. 🟡 Next.js, Sites e Supabase definidos; domínio e provedor de e-mail permanecem na lista final.
22. Proprietário conectar as contas que exigirem verificação.

Marco B: contas reais de PIX e WhatsApp do proprietário conectadas e integração técnica validada.

### Bloco C - Fundação técnica

23. ~~Criar monorepo organizado.~~ ✅ Concluído em 24/07/2026.
24. ~~Criar aplicação Next.js com TypeScript.~~ ✅ Concluído em 24/07/2026.
25. ~~Criar pacote de componentes que reproduza a interface atual.~~ ✅ Concluído em 24/07/2026.
26. ~~Configurar lint, formatação e checagem de tipos.~~ ✅ Concluído em 24/07/2026.
27. ~~Configurar testes unitários, integração e ponta a ponta.~~ ✅ Concluído em 24/07/2026.
28. ~~Configurar ambientes local, homologação e produção.~~ ✅ Concluído em 24/07/2026.
29. ~~Criar `.env.example` sem segredos.~~ ✅ Concluído em 24/07/2026.
30. ~~Configurar Supabase/PostgreSQL.~~ ✅ Migrações versionadas; conexão do projeto real permanece na lista final.
31. ~~Configurar Supabase Storage.~~ ✅ Bucket privado e RLS versionados; aplicação no projeto real permanece na lista final.
32. ~~Criar pipeline de build e testes no GitHub.~~ ✅ Concluído em 24/07/2026.
33. ~~Criar tratamento padrão de erros e logs.~~ ✅ Concluído em 24/07/2026.
34. ~~Documentar como executar o projeto.~~ ✅ Concluído em 24/07/2026.

Marco C: concluído tecnicamente em 24/07/2026. Aplicação base compila e passa em formatação, lint, tipos, testes unitários e build; conexões externas permanecem na lista final.

### Bloco D - Banco multiempresa

35. Criar diagrama de dados.
36. Criar tabelas de empresas e usuários.
37. Criar papéis e permissões.
38. Criar clientes, contatos, endereços e documentos.
39. Criar propostas, empréstimos, parcelas e pagamentos.
40. Criar cobranças, renegociações e notificações.
41. Criar contratos, arquivos, transações PIX e webhooks.
42. Criar planos SaaS, assinaturas e limites.
43. Criar logs de auditoria.
44. Adicionar `tenant_id`, chaves estrangeiras, índices e integridade.
45. Criar políticas RLS.
46. Criar migrações e dados fictícios.
47. Testar que a Empresa A não acessa a Empresa B.
48. Testar backup e restauração.

Marco D: banco migrável e isolamento comprovado.

### Bloco E - Autenticação e usuários

49. Criar cadastro seguro da empresa.
50. Criar login por e-mail ou telefone e senha.
51. Manter CPF somente como dado cadastral complementar.
52. Criar confirmação de contato.
53. Criar recuperação de senha.
54. Criar sessão segura e encerramento de sessões.
55. Criar Super Admin, Administrador, Gestor, Cobrador e Cliente.
56. Proteger páginas, APIs e operações por permissão.
57. Criar convite e desativação de membros.
58. Criar MFA para funções administrativas.
59. Auditar login, logout e tentativas inválidas.
60. Testar todos os perfis e bloqueios.

Marco E: autenticação real e permissões testadas.

### Bloco F - Migração fiel da interface

61. Migrar o design system sem redesenhar.
62. Migrar splash e login preservando aparência.
63. Migrar dashboard preservando aparência.
64. Migrar clientes e cadastro preservando aparência.
65. Migrar propostas, contratos e agenda preservando aparência.
66. Migrar painel do cliente e cobrador preservando aparência.
67. Migrar configurações, histórico, localização e navegação.
68. Substituir emojis por ativos somente se isso não alterar a identidade aprovada.
69. Adaptar responsividade sem mudar estilo.
70. Executar comparação visual com o protótipo.

Marco F: interface preservada e funcional em navegador.

### Bloco G - Primeiro fluxo vertical real

71. Cadastrar empresa de teste.
72. Autenticar administrador.
73. Cadastrar cliente com validações.
74. Enviar documentos ao Storage.
75. Salvar cliente no PostgreSQL.
76. Pesquisar e visualizar cliente.
77. Editar e arquivar cliente.
78. Prevenir CPF duplicado dentro das regras aprovadas.
79. Registrar auditoria.
80. Provar isolamento multiempresa.
81. Testar o fluxo no celular e computador.

Marco G: primeiro fluxo real aprovado.

### Bloco H - Cadastro do cliente por link e WhatsApp

82. Criar convite de cadastro com token único, expiração e empresa vinculada.
83. Criar link seguro de cadastro.
84. Enviar o link por template oficial do WhatsApp.
85. Cliente preencher seus próprios dados e documentos.
86. Validar telefone e aceite de privacidade.
87. Salvar cadastro como `em análise`.
88. Notificar administrador.
89. Administrador aprovar, solicitar correção ou recusar com motivo adequado.
90. Gerar acesso do cliente somente após aprovação.
91. Enviar confirmação e link oficial do aplicativo/web.
92. Registrar mensagens, decisões e horários em auditoria.
93. Testar token vencido, repetido, adulterado e pertencente a outra empresa.

Marco H: cadastro por WhatsApp integrado ao módulo Novo Cliente.

### Bloco I - Propostas e análise

94. Criar solicitação de crédito.
95. Definir valor, finalidade, frequência e prazo.
96. Implementar simulador com regras aprovadas.
97. Definir arredondamento e calendário.
98. Criar checklist documental.
99. Criar análise manual e parecer.
100. Criar score transparente e revisável.
101. Criar alçadas de aprovação.
102. Criar estados e validade da proposta.
103. Registrar motivo de recusa sem discriminação.
104. Gerar resumo para confirmação do cliente.
105. Testar cálculos com casos conhecidos e revisão profissional.

Marco I: proposta calculada e aprovação auditável.

### Bloco J - Núcleo financeiro

106. Converter proposta aprovada em empréstimo.
107. Gerar cronograma de parcelas.
108. Implementar frequências diárias, semanais, quinzenais e mensais.
109. Implementar dias úteis e feriados conforme regra aprovada.
110. Criar estados de parcelas.
111. Registrar pagamento integral e parcial.
112. Definir distribuição de pagamento parcial.
113. Calcular saldo devedor.
114. Criar quitação antecipada.
115. Criar recibos numerados.
116. Criar estorno autorizado e auditado.
117. Impedir mudanças silenciosas.
118. Criar razão financeira consistente.
119. Testar centavos, datas, duplicidade e concorrência.

Marco J: núcleo financeiro validado.

### Bloco K - Contratos e assinatura

120. Obter modelo contratual revisado juridicamente.
121. Criar campos dinâmicos.
122. Gerar PDF com identificador único.
123. Criar versão imutável.
124. Integrar assinatura eletrônica adequada.
125. Registrar consentimento e evidências.
126. Armazenar original e assinado.
127. Criar hash, versões e aditivos.
128. Bloquear liberação sem contrato válido quando exigido.
129. Testar o PDF em celular e computador.

Marco K: contrato assinável e rastreável.

### Bloco L - PIX real e conciliação

130. Criar adaptador independente do provedor PIX.
131. Gerar cobrança individual por parcela.
132. Gerar QR Code e copia-e-cola.
133. Criar validade e expiração.
134. Receber webhooks.
135. Validar assinatura do webhook.
136. Implementar idempotência.
137. Dar baixa automática após confirmação válida.
138. Emitir recibo e notificar as partes.
139. Criar tela de conciliação e divergências.
140. Implementar devolução/estorno conforme provedor e regra.
141. Testar sandbox integralmente.
142. Autorizar produção somente após revisão e aprovação.

Marco L: PIX conciliado e seguro.

### Bloco M - Cobrança por WhatsApp

143. Definir política de horários e consentimento.
144. Revisar textos para evitar ameaça, exposição ou constrangimento.
145. Criar templates de pré-vencimento, vencimento, atraso, pagamento, quitação e renegociação.
146. Criar fila de envio e tentativas.
147. Impedir duplicidade.
148. Registrar destinatário, evento, horário, status e resposta.
149. Criar opt-out quando aplicável.
150. Criar escalonamento humano.
151. Criar painel de mensagens pendentes e falhas.
152. Aplicar limites por plano.
153. Testar horários bloqueados, feriados, número inválido e falha do provedor.

Marco M: comunicação oficial, respeitosa e auditável.

### Bloco N - Dashboard, relatórios e portal

154. Implementar indicadores validados.
155. Implementar recebido, aberto, vencido e previsão.
156. Implementar clientes ativos, quitados e inadimplentes.
157. Implementar agenda e desempenho por cobrador.
158. Criar filtros.
159. Criar relatórios e exportações.
160. Validar totais contra o banco.
161. Criar portal seguro do cliente.
162. Exibir contratos, saldo, parcelas, pagamentos e recibos.
163. Permitir PIX, comprovantes e atendimento.
164. Ocultar dados internos e score restrito.
165. Testar isolamento entre clientes.

Marco N: indicadores confiáveis e portal seguro.

### Bloco O - Assinatura do SaaS

166. Definir planos e preços.
167. Definir limites de clientes, usuários, mensagens e armazenamento.
168. Criar catálogo de planos.
169. Integrar cobrança recorrente.
170. Processar webhooks de assinatura.
171. Implementar tolerância, upgrade, downgrade e cancelamento.
172. Bloquear recursos adequadamente sem apagar dados.
173. Criar faturas, avisos e métricas.
174. Validar impostos e documentos fiscais.

Marco O: assinatura recorrente ativa.

### Bloco P - IA responsável

175. Criar camada de provedores.
176. Mascarar dados sensíveis.
177. Criar mensagens assistidas com revisão humana.
178. Criar resumo da carteira e histórico.
179. Criar priorização explicável.
180. Criar detecção de anomalias.
181. Proibir decisão automática de crédito somente por IA.
182. Auditar modelo, prompt e saída relevante.
183. Criar limites de custo e opção de desligamento.
184. Testar vazamento, alucinação e instruções maliciosas.

Marco P: IA controlada.

### Bloco Q - Segurança, LGPD e qualidade

185. Inventariar dados pessoais e financeiros.
186. Validar base legal, termos e política de privacidade.
187. Aplicar menor privilégio e HTTPS.
188. Proteger segredos e dados sensíveis.
189. Implementar rate limit e proteção contra ataques comuns.
190. Criar retenção, descarte, exportação e anonimização.
191. Criar resposta a incidentes.
192. Automatizar backup e testar restauração.
193. Executar revisão de segurança.
194. Executar testes unitários, integração, E2E e permissões.
195. Testar acessibilidade, navegadores, telas e desempenho.
196. Corrigir falhas críticas e congelar candidata.

Marco Q: versão aprovada para piloto.

### Bloco R - Aplicativos Android e iPhone

197. Confirmar estabilidade da API.
198. Criar projeto Flutter.
199. Reproduzir o design aprovado sem redesenhar.
200. Implementar login e recuperação.
201. Implementar gestor, cobrador e cliente.
202. Implementar clientes, contratos, parcelas e pagamentos.
203. Implementar PIX e compartilhamento seguro.
204. Implementar push e sessão segura.
205. Criar offline limitado quando necessário.
206. Testar Android e iOS.
207. Preparar ícones, splash e materiais.
208. Publicar testes internos.
209. Corrigir falhas.
210. Publicar versões oficiais.

Marco R: aplicativos publicados.

### Bloco S - Produção, lançamento e operação

211. Configurar domínio e DNS.
212. Configurar produção web, API, banco e Storage.
213. Configurar certificados, e-mail e filas.
214. Configurar monitoramento e alertas.
215. Configurar backup e retenção.
216. Criar Super Admin com autenticação forte.
217. Migrar somente dados validados.
218. Executar teste completo pós-implantação.
219. Criar manual e treinamento.
220. Executar piloto controlado.
221. Corrigir problemas do piloto.
222. Liberar vendas gradualmente.
223. Criar suporte e central de ajuda.
224. Monitorar disponibilidade, filas, webhooks, custos e receita.
225. Criar processo seguro de atualização.
226. Manter changelog e calendário de manutenção.
227. Revisar segurança e restauração periodicamente.
228. Priorizar versões futuras por impacto, risco, esforço e receita.

Marco S: produto em operação contínua.

## 6. Ordem imediata de trabalho

O início operacional será:

1. Salvar este roteiro.
2. Preservar o protótipo.
3. Criar os documentos técnicos do repositório.
4. Escolher o provedor e conectar a conta PIX real do proprietário, usando homologação técnica quando disponível.
5. Escolher o provedor e conectar a conta e o número reais de WhatsApp do proprietário.
6. Criar a fundação Next.js/Supabase.
7. Implementar autenticação e isolamento.
8. Entregar o primeiro fluxo real de clientes.
9. Integrar o cadastro por link ao módulo Novo Cliente.
10. Prosseguir pelos marcos até o aplicativo completo.

## 7. Registro de progresso

| Marco | Estado inicial |
|---|---|
| A - Escopo | Aprovado; ruleset final pendente |
| B - Conexões de teste | Em preparação; variáveis PIX/WhatsApp concluídas |
| C - Fundação | Concluído tecnicamente |
| D - Banco | Pendente |
| E - Autenticação | Pendente |
| F - Interface migrada | Pendente |
| G - Fluxo de clientes | Pendente |
| H - Cadastro WhatsApp | Pendente |
| I - Propostas | Pendente |
| J - Financeiro | Pendente |
| K - Contratos | Pendente |
| L - PIX | Pendente |
| M - Cobrança WhatsApp | Pendente |
| N - Relatórios e portal | Pendente |
| O - Assinatura SaaS | Pendente |
| P - IA | Pendente |
| Q - Segurança e qualidade | Pendente |
| R - Mobile | Pendente |
| S - Produção e operação | Pendente |

## 8. Primeiras decisões externas necessárias

Estas decisões serão solicitadas no momento certo:

- provedor PIX;
- conta empresarial verificada;
- provedor oficial de WhatsApp Business/API;
- número comercial verificado;
- domínio;
- provedor de e-mail;
- Supabase;
- Vercel;
- provedor de assinatura eletrônica;
- cobrança recorrente do SaaS;
- contas de desenvolvedor Google Play e Apple;
- regras financeiras aprovadas;
- revisão jurídica, contábil e de privacidade.

O Codex deverá apresentar opções, custos e requisitos antes de pedir cada conexão. O proprietário não deverá compartilhar segredos na conversa.
