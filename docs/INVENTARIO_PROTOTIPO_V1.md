# Inventário do protótipo oficial V1

Arquivo de referência: `prototype/ControlPremium_PROTOTIPO_OFICIAL_V1.html`  
Tamanho auditado: 2.803 linhas  
Arquitetura atual: HTML5 monolítico, CSS e JavaScript embutidos, sem framework, API ou banco.

## 1. Estrutura visual

O protótipo simula um telefone de aproximadamente 390 × 820 pixels. Usa tema escuro, dourado como cor principal, superfícies em tons escuros, cartões, bordas, brilho, partículas, loader e animações. Emojis funcionam como ícones.

### Telas

| ID | Tela | Perfil principal | Recursos visuais e ações |
|---|---|---|---|
| `splash` | Abertura | Todos | Marca, slogan e loader |
| `login` | Login | Todos | CPF, entrada e login rápido local |
| `dashboard` | Dashboard | Admin | KPIs, gráfico, cobranças e cobrança com IA simulada |
| `clientes` | Clientes | Admin | Busca e lista de clientes |
| `cadastrar` | Cadastrar | Admin | Link WhatsApp, cadastro manual e upload de imagens |
| `renovacoes` | Propostas | Admin | Score, análise e aprovação/negação local |
| `contratos` | Contratos | Admin | Gerador IA, simulador e liberação local |
| `agenda` | Agenda | Admin | Compromissos e estados fictícios |
| `ia` | IA Assistente | Admin | Chat e sugestões com respostas locais |
| `cobrador` | Minha Rota | Cobrador | Devedores, endereços e abertura de mapas |
| `cliente` | Meu Painel | Cliente | Débito, PIX visual, quitação, negociação e score |
| `painel` | Configurações | Admin | Assinante, automações, assinatura e cobradores |
| `historico` | Histórico | Admin | Eventos locais |
| `localizar` | Localização | Admin | Solicitação e exibição local de geolocalização |

### Componentes globais

- moldura de telefone, notch e barra de status;
- partículas decorativas;
- navegação inferior;
- menu lateral por perfil;
- painel lateral de notificações;
- folha de escolha Waze/Google Maps;
- detalhe de notificação;
- toast;
- fogos de celebração;
- overlay de rota.

## 2. Perfis e acessos fictícios

O protótipo mantém usuários em um array JavaScript:

| Perfil | CPF fictício | Empresa simulada |
|---|---|---|
| Administrador | `00000000000` | `demo1` |
| Cobrador | `11111111111` | `demo1` |
| Cliente João | `12345678900` | `demo1` |
| Cliente Carlos | `45611122200` | `demo1` |
| Cliente Mariana | `78911122200` | `demo1` |
| Administrador 2 | `99999999999` | `demo2` |

Esses dados existem somente para demonstração e não poderão ser migrados como credenciais reais.

## 3. Estado e persistência local

Chave única: `controle_premium`.

| Campo | Conteúdo |
|---|---|
| `clientesDB` | Clientes, documentos Base64, capital e histórico |
| `cobradoresDB` | Cobradores cadastrados localmente |
| `assinaturaVencimento` | Data visual da assinatura |
| `dadosAssinantePorId` | Dados bancários e cadastrais por assinante |
| `auditoriaLog` | Eventos editáveis no navegador |
| `localizacoesDB` | Coordenadas obtidas pelo navegador |
| `solicitacoesLocalizacao` | Solicitações locais |
| `adminNamePorId` | Nome de exibição |
| `usuariosExtras` | Clientes e cobradores criados em execução |
| `propostasNovoEmprestimoDB` | Solicitações locais |
| `credenciaisBiometricasDB` | Identificadores que simulam login rápido |
| `automacoesPorId` | Flags de cobrança, análise e negociação |

### Dependências críticas do `localStorage`

- clientes e cobradores desaparecem ao limpar o navegador;
- documentos podem exceder o limite de armazenamento;
- qualquer pessoa com acesso ao navegador pode alterar dados e auditoria;
- não existe concorrência, transação, backup ou recuperação confiável;
- o isolamento por `assinanteId` acontece somente no frontend;
- dados bancários e pessoais ficam sem proteção adequada.

## 4. Funções que operam localmente

| Grupo | Funções e comportamento |
|---|---|
| Navegação | `show`, `montarMenu`, abrir/fechar drawers e retorno ao login |
| Formatação | Máscaras de CPF/telefone, moeda BRL, saudação e relógio |
| Persistência | `salvarEstado` e `carregarEstado` |
| Clientes | Inicialização, lista, busca, cadastro local e preview/Base64 |
| Cobradores | Cadastro, lista e remoção locais |
| Dashboard | KPIs e gráfico calculados do estado local |
| Notificações | Registro, lista, detalhe e histórico locais |
| Rotas | Abertura de URLs do Waze e Google Maps |
| Localização | Uso da permissão de geolocalização do navegador |
| Interface | Partículas, toast, loader e fogos |

## 5. Funções parciais

| Função | O que existe | O que falta |
|---|---|---|
| Multiempresa | Filtro por `assinanteId` | Backend, RLS e teste de invasão |
| Autenticação | CPF comparado com array local | Identidade, senha, sessão, MFA e recuperação |
| Login rápido | Registro local | WebAuthn/biometria real e revogação |
| Cadastro | Campos e imagens | CPF real, Storage, antivírus, limites e consentimento |
| Score | Fórmula demonstrativa | Regra aprovada, explicação, revisão e governança |
| Financeiro | Cálculos simples | Decimal, ledger, idempotência e regras aprovadas |
| Contratos | Cronograma visual | PDF imutável, assinatura e evidências |
| Auditoria | Lista de eventos | Imutabilidade, usuário, IP/correlação e retenção |
| Localização | Coordenadas locais | Consentimento, backend, expiração e autorização |
| Assinatura SaaS | Renovação visual | Gateway, webhook, fatura e estados |

## 6. Funções simuladas

- IA de análise, cobrança, negociação, contrato e suporte;
- geração e confirmação de PIX;
- QR Code e baixa automática;
- WhatsApp oficial — existe apenas abertura de compartilhamento;
- URL de cadastro — usa placeholder `https://controle.app/cadastro`;
- assinatura eletrônica;
- aprovação de crédito real;
- notificação e automação em servidor;
- conciliação, estorno e recibo financeiro;
- download do aplicativo e envio de credenciais.

## 7. Funções JavaScript por domínio

### Sessão e empresa

`assinanteAtualId`, `clientesDoAssinante`, `cobradoresDoAssinante`, `pertenceAoAssinante`, `cpfJaExiste`, `dadosAssinanteAtual`, `adminNameAtual`, `automacoesAtuais`, `entrar`, `loginRapido`, `voltarLogin`.

### Clientes e propostas

`initClientes`, `clienteLogado`, `renderizarClientes`, `filtrarClientes`, `enviarLinkWhatsApp`, `previewFoto`, `lerArquivoComoBase64`, `salvarNovoClienteCompleto`, `renderizarRenovacoes`, `negarRenovacao`, `aprovarRenovacao`, `solicitarNovoEmprestimo`, `pedirRenovacaoImediata`.

### Contratos e finanças

`parseNumeroBR`, `fmtMoney`, `calcularScore`, `classificarRisco`, `gerarContratoIA`, `renderizarSelectClienteContrato`, `confirmarContrato`, `gerarParcelasComIA`, `clienteQuitarEmprestimo`, `negociarDividaIA`, `abrirPixCobranca`, `copiarPix`.

### Comunicação, auditoria e apoio

`registrarAuditoria`, `renderizarHistorico`, `renderizarNotificacoes`, `cobrarComIA`, `cobrarTodosAtrasados`, `responderSuporte`, `enviarChat`, `perguntar`, `capturarLocalizacaoCliente`, `solicitarLocalizacao`, `renderizarRotaCobrador`, `renderizarLocalizar`.

## 8. Dados fictícios

O protótipo inicia três clientes na empresa `demo1`:

- João Silva, sem capital em aberto;
- Carlos Antunes, capital demonstrativo de R$ 180;
- Mariana Santos, capital demonstrativo de R$ 650.

Valores, telefones, endereços, histórico, score, parcelas, juros e status são fictícios. O dashboard inicial também contém valores visuais que são substituídos quando o JavaScript calcula o estado.

## 9. Problemas encontrados

### Críticos

1. A troca de splash para login depende de toda a inicialização JavaScript.
2. Uma falha antes do `setTimeout` pode manter a splash indefinidamente.
3. Todo o produto está em um único arquivo.
4. Não existe servidor, banco, autenticação real, autorização ou API.
5. CPF funciona como credencial.
6. O isolamento pode ser contornado no navegador.
7. Documentos pessoais podem ser gravados em Base64 no `localStorage`.

### Segurança

1. Uso recorrente de `innerHTML` com dados interpolados cria risco de XSS.
2. Auditoria pode ser alterada ou apagada.
3. Não há CSP, rate limit, MFA ou sessão segura.
4. Não há política real de retenção, anonimização ou descarte.
5. Links externos não seguem uma política uniforme.

### Financeiro

1. Uso de `Number` para dinheiro.
2. Fórmulas de juros não foram aprovadas.
3. Pagamento, baixa, estorno e PIX não têm idempotência.
4. Não existe razão financeira ou integridade relacional.

### Experiência e manutenção

1. Layout fixo de telefone, sem responsividade real.
2. Emojis variam por sistema.
3. Estilos inline e funções globais dificultam testes.
4. Acessibilidade de foco, teclado e rótulos está incompleta.

## 10. Regra de migração

Cada tela será reproduzida na nova arquitetura e comparada com este protótipo. Uma função visual só poderá ser removida quando houver substituição equivalente registrada ou autorização explícita. O arquivo original permanecerá imutável.
