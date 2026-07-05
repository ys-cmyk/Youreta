import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/env";

// Apple App Review demo sign-in.
//
// Apple's reviewer signs in through the EXISTING /login UI with a fixed email
// and a fixed 6-digit code (no real email delivery). The login page POSTs the
// entered { email, code } here BEFORE its normal verifyOtp call; a non-200
// falls through to the real flow, so real users are unaffected.
//
// The whole feature is gated behind three server-only env vars. If any is
// missing the route returns 404 — the endpoint simply does not exist unless the
// owner has deliberately configured it. The secret key lives only in this
// server route handler and is never logged, never returned, and never imported
// from client code, so it never reaches the browser bundle.
//
// Env vars (set in Vercel, NEVER prefixed NEXT_PUBLIC):
//   REVIEW_EMAIL             the single email allowed to use the fixed code
//   REVIEW_CODE              the fixed 6-digit code
//   SUPABASE_SECRET_KEY      Supabase secret (service-role) key; falls back to
//                            SUPABASE_SERVICE_ROLE_KEY

// Constant-time string comparison. Pads both sides to a fixed length so the
// comparison itself doesn't leak the length, and hashing isn't needed: we only
// compare short known-length secrets. Returns false on any type mismatch.
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length, 32);
  const bufA = Buffer.alloc(len);
  const bufB = Buffer.alloc(len);
  bufA.write(a);
  bufB.write(b);
  // timingSafeEqual requires equal-length buffers, which the padding guarantees.
  const equal = timingSafeEqual(bufA, bufB);
  return equal && a.length === b.length;
}

export async function POST(request: Request) {
  const reviewEmail = (process.env.REVIEW_EMAIL ?? "").trim().toLowerCase();
  const reviewCode = process.env.REVIEW_CODE ?? "";
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";

  // Not configured → the feature does not exist. Never reveal which var is set.
  if (!reviewEmail || !reviewCode || !secretKey || !SUPABASE_URL) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { email?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code : "";

  // Same response for wrong email vs wrong code — don't leak which was wrong.
  const emailOk = safeEqual(email, reviewEmail);
  const codeOk = safeEqual(code, reviewCode);
  if (!emailOk || !codeOk) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  // Admin client — server-only. Never log the key; never import this from the
  // client. Uses the canonical review email (already validated equal).
  const admin = createAdminClient(SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ensure the reviewer account exists (idempotent: ignore "already registered").
  const { error: createError } = await admin.auth.admin.createUser({
    email: reviewEmail,
    email_confirm: true,
  });
  if (createError && !/already.*registered/i.test(createError.message)) {
    return NextResponse.json({ error: "Sign-in failed" }, { status: 500 });
  }

  // Mint a real one-time email OTP for this account without sending any email.
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: reviewEmail,
    });
  const emailOtp = linkData?.properties?.email_otp;
  if (linkError || !emailOtp) {
    return NextResponse.json({ error: "Sign-in failed" }, { status: 500 });
  }

  // Verify the OTP with the normal cookie-backed server client so the session
  // cookies are set on the response, exactly like any real sign-in.
  const supabase = await createClient();
  let { error: verifyError } = await supabase.auth.verifyOtp({
    email: reviewEmail,
    token: emailOtp,
    type: "email",
  });
  if (verifyError) {
    ({ error: verifyError } = await supabase.auth.verifyOtp({
      email: reviewEmail,
      token: emailOtp,
      type: "magiclink",
    }));
  }
  if (verifyError) {
    return NextResponse.json({ error: "Sign-in failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
