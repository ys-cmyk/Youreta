import { createBrowserClient, type CookieOptions } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

// Browser-side Supabase client for use inside `'use client'` components.
//
// Custom cookie methods, for one reason: the PKCE code_verifier. In the native
// shell, Capacitor patches document.cookie to sync through native storage
// ASYNCHRONOUSLY, and iOS can drop not-yet-flushed cookies when the app is
// backgrounded during an external-browser sign-in — the exchange then fails
// with "PKCE code verifier not found in storage". So verifier cookies are
// mirrored into localStorage at write time (synchronous, eagerly persisted)
// and served from the mirror on read when the cookie has vanished. Sessions
// still live in real cookies so the server/middleware sees them; the mirror
// only ever covers *code-verifier* entries. Harmless in plain browsers.
const MIRROR_PREFIX = "yeta:cookie:";

function readCookieJar(): { name: string; value: string }[] {
  if (typeof document === "undefined" || !document.cookie) return [];
  return document.cookie
    .split("; ")
    .filter(Boolean)
    .map((c) => {
      const i = c.indexOf("=");
      return { name: c.slice(0, i), value: c.slice(i + 1) };
    });
}

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const jar = readCookieJar();
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(MIRROR_PREFIX)) continue;
            const name = key.slice(MIRROR_PREFIX.length);
            if (!jar.some((c) => c.name === name)) {
              const value = localStorage.getItem(key);
              if (value !== null) jar.push({ name, value });
            }
          }
        } catch {
          // mirror is best-effort
        }
        return jar;
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        for (const { name, value, options } of cookiesToSet) {
          try {
            let str = `${name}=${value}; path=${options?.path ?? "/"}`;
            if (typeof options?.maxAge === "number") {
              str += `; max-age=${options.maxAge}`;
            }
            if (options?.domain) str += `; domain=${options.domain}`;
            if (options?.sameSite) {
              str += `; samesite=${
                options.sameSite === true ? "lax" : options.sameSite
              }`;
            }
            if (options?.secure) str += "; secure";
            document.cookie = str;
          } catch {
            // cookie write is best-effort; the mirror below still runs
          }
          try {
            if (name.includes("code-verifier")) {
              const deleted =
                !value ||
                (typeof options?.maxAge === "number" && options.maxAge <= 0);
              if (deleted) {
                localStorage.removeItem(MIRROR_PREFIX + name);
              } else {
                localStorage.setItem(MIRROR_PREFIX + name, value);
              }
            }
          } catch {
            // mirror is best-effort
          }
        }
      },
    },
  });
}
