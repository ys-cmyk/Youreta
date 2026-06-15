import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing endpoint: exchange the code for a session, ensure a
// profile row exists, then redirect onward.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Only allow internal redirects: a single leading slash, never "//host" or a
  // full URL, so a crafted ?next= can't bounce the user to another site.
  const rawNext = searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/events";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const displayName = user.email ? user.email.split("@")[0] : "Guest";
    await supabase
      .from("ec_profiles")
      .upsert(
        { id: user.id, email: user.email ?? null, display_name: displayName },
        { onConflict: "id" }
      );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
