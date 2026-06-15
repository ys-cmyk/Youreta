import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./env";

// Public routes that an unauthenticated visitor is allowed to reach.
const PUBLIC_PREFIXES = ["/login", "/auth", "/config-error"];

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Send the visitor to a readable setup page rather than crashing the whole
  // app with a 500 when Supabase isn't configured.
  const toConfigError = () => {
    if (path === "/config-error") return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/config-error";
    url.search = "";
    return NextResponse.redirect(url);
  };

  if (!isSupabaseConfigured()) return toConfigError();

  try {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    // IMPORTANT: getUser() revalidates the token; do not use getSession() here.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

    if (!user && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }

    return response;
  } catch {
    // Misconfigured credentials (e.g. malformed URL) — fail readable, not 500.
    return toConfigError();
  }
}
