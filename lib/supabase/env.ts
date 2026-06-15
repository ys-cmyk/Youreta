// Supabase config, read from public env vars (inlined at build time).
// Centralised so we can validate it and degrade gracefully instead of
// crashing every route when it's missing or malformed.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return /^https?:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 0;
}
