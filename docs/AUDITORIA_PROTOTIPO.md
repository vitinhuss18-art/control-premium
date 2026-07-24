# Auditoria do protótipo Control Premium

## Estado atual

O `index.html` é um protótipo visual e funcional executado inteiramente no navegador. Ele representa bem a
identidade do produto, mas não deve ser tratado como versão de produção.

## Telas identificadas

- Splash e login.
- Dashboard administrativo.
- Clientes e cadastro.
- Renovações.
- Contratos e simulador.
- Agenda.
- Assistente de IA.
- Painel do cobrador.
- Painel do cliente.
- Configurações do assinante.
- Histórico e auditoria visual.
- Localização e rotas.

## Funciona no protótipo

- Navegação entre telas e menus.
- Máscaras básicas de CPF e telefone.
- Cadastro local de clientes e cobradores.
- Pesquisa e renderização de clientes.
- Cálculos demonstrativos de parcelas.
- Filtros de dados pelo assinante simulado.
- Histórico e notificações locais.
- Cópia de chave PIX cadastrada.
- Abertura de rotas em aplicativos externos.
- Persistência local no mesmo navegador.

## Parcial

- Separação entre assinantes: existe no JavaScript, mas depende do navegador e não constitui isolamento seguro.
- Validação de CPF: valida quantidade de dígitos, mas ainda não valida o algoritmo completo.
- Documentos e imagens: convertidos para Base64 e armazenados localmente, sem armazenamento seguro.
- Auditoria: útil para demonstração, porém alterável e sem garantia de integridade.
- Contratos e parcelas: gerados no navegador, sem regras financeiras formalmente aprovadas.
- Localização: depende da permissão do aparelho e permanece apenas no protótipo.

## Simulado

- Login por CPF e biometria.
- PIX, renovação e confirmação de pagamento.
- IA para cobrança, contrato, negociação e suporte.
- WhatsApp automatizado.
- Assinatura do SaaS.
- Notificações e filas.
- Webhooks e conciliação financeira.
- Score de risco e aprovação de crédito.

## Dados armazenados localmente

O protótipo utiliza `localStorage`, contendo cadastros, configurações, histórico, imagens em Base64 e
identificadores simulados. Esse mecanismo é adequado apenas para demonstração.

## Riscos principais

- CPF usado como mecanismo de login sem senha.
- Dados pessoais armazenados sem proteção no navegador.
- Ausência de banco central, backup e restauração.
- Ausência de autenticação real e permissões no servidor.
- Cálculos financeiros sem especificação formal e testes determinísticos.
- Recursos simulados que podem parecer transações reais.
- Ausência de webhooks autenticados e idempotência.
- Ausência de logs de auditoria imutáveis.

## Elementos que devem ser preservados

- Paleta escura com dourado e cores de apoio.
- Estrutura visual no formato de aplicativo móvel.
- Hierarquia dos cards, indicadores e botões.
- Nomes dos módulos e fluxo de navegação.
- Responsividade e feedback visual.
- Identidade `Control$ Premium` apresentada no protótipo.

## Recomendação

Preservar o HTML como referência oficial e migrar cada fluxo gradualmente para componentes reutilizáveis,
API e PostgreSQL. Nenhum dado do protótipo deve ser migrado para produção sem validação explícita.

