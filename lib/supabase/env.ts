// Supabase config, read from public env vars (inlined at build time).
// Centralised so we can validate/normalise it and degrade gracefully instead
// of crashing every route when it's missing or malformed.
//
// The URL is reduced to its origin (scheme + host). Supabase clients expect
// just "https://<ref>.supabase.co"; a pasted REST endpoint or trailing path
// (e.g. ".../rest/v1/") would otherwise produce a bad auth request path and
// Supabase rejects it with "Invalid path specified in request URL".
function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

export const SUPABASE_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
);
export const SUPABASE_ANON_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
).trim();

export function isSupabaseConfigured(): boolean {
  return /^https?:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 0;
}
