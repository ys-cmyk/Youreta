// Supabase config, read from public env vars (inlined at build time).
// Centralised so we can validate/normalise it and degrade gracefully instead
// of crashing every route when it's missing or malformed.
//
// Trailing slashes and stray whitespace are stripped: a trailing "/" on the
// URL produces a double slash in the auth request path ("…supabase.co//auth/
// v1/otp"), which Supabase rejects with "Invalid path specified in request URL".
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
export const SUPABASE_ANON_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
).trim();

export function isSupabaseConfigured(): boolean {
  return /^https?:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 0;
}
