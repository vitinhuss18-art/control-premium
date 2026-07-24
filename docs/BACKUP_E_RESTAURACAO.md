# Backup e restauração

## Objetivo

Garantir que banco e arquivos possam ser recuperados sem misturar empresas nem perder a trilha de auditoria.

## Política técnica

- Backups automáticos do PostgreSQL devem ser ativados no plano do ambiente real.
- Storage privado deve possuir versionamento ou cópia protegida compatível com o provedor escolhido.
- Credenciais de backup ficam somente no cofre do ambiente.
- Cada restauração é executada primeiro em ambiente isolado.
- O teste de restauração usa somente dados fictícios até a revisão de produção.

## Teste de restauração

1. Registrar versão das migrações, horário e responsável autorizado.
2. Criar destino isolado sem acesso público.
3. Restaurar o backup do PostgreSQL.
4. Restaurar ou reconectar a cópia dos objetos privados.
5. Executar todas as verificações de integridade e RLS.
6. Confirmar contagens por tabela e hashes de uma amostra de arquivos.
7. Executar `supabase/tests/tenant_isolation.sql`.
8. Confirmar que a Empresa A não acessa dados ou arquivos da Empresa B.
9. Registrar duração, resultado, falhas e ações corretivas.
10. Descartar com segurança o ambiente temporário.

## Critérios de aprovação

- migrações aplicadas sem erro;
- chaves estrangeiras válidas;
- zero referências cruzadas entre empresas;
- RLS habilitado nas tabelas operacionais;
- auditoria preservada;
- arquivos privados recuperáveis;
- teste de isolamento aprovado.

A execução real depende da conexão de um projeto Supabase por titular elegível ou responsável autorizado.
