import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let cachedClient: SupabaseClient | null = null;

/**
 * Cliente Supabase para uso no navegador (autenticação, sessão). Retorna
 * null se as variáveis de ambiente não estiverem configuradas, para que as
 * páginas mostrem um erro claro em vez de quebrar silenciosamente.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return cachedClient;
}
