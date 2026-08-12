begin;

-- Aplicar somente depois que a versão web que chama
-- submit_client_proposal_with_consent estiver publicada. Remove os caminhos
-- antigos que permitiam criar uma proposta sem a evidência correspondente.
revoke execute on function public.submit_client_proposal(
  text, uuid, text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated;

drop policy if exists client_proposals_insert_anon
  on public.client_proposals;

revoke insert on table public.client_proposals from anon, authenticated;

commit;
