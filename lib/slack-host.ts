// Server-only helper that resolves the Supabase user id of the Slack bot's
// "host" account. Destinations created by the /eta slash command are hosted by
// a single service account (default slack-bot@youreta.app) rather than a real
// human, because Slack has no account-linking in this MVP.
//
// The account is created idempotently via the admin API — the exact pattern
// used by app/api/review-login/route.ts: createUser, and if it already exists,
// resolve the id via generateLink. The id is cached in a module-level variable
// so we do at most one round-trip per server instance.
//
// NEVER import this from client code: it uses the service-role key.

import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";

// Factory for the admin (service-role) client. Exported so the Slack routes can
// reuse a single construction path for their own service-role reads/writes.
// Throws if the environment isn't configured — callers are already env-gated
// (they 404 without the Slack secrets), but the service key is separate.
export function createAdminClient(): SupabaseClient {
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!SUPABASE_URL || !secretKey) {
    throw new Error("Supabase service credentials are not configured");
  }
  return createSupabaseAdminClient(SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const BOT_EMAIL = process.env.SLACK_BOT_HOST_EMAIL ?? "slack-bot@youreta.app";

// Module-level cache: the bot host id is stable for the life of the process.
let cachedBotHostId: string | null = null;

export async function getBotHostId(): Promise<string> {
  if (cachedBotHostId) return cachedBotHostId;

  const admin = createAdminClient();

  let botId: string | null = null;

  // Idempotent create. On success we have the id directly.
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: BOT_EMAIL,
      email_confirm: true,
    });
  if (createError) {
    if (!/already.*registered/i.test(createError.message)) {
      throw createError;
    }
    // Already exists → resolve the id via generateLink (we discard the link /
    // OTP; we only want data.user.id).
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: BOT_EMAIL,
      });
    if (linkError || !linkData?.user?.id) {
      throw linkError ?? new Error("Could not resolve Slack bot host id");
    }
    botId = linkData.user.id;
  } else {
    botId = created.user?.id ?? null;
  }

  if (!botId) throw new Error("Could not resolve Slack bot host id");

  // Ensure a profile row exists so the destination has a sensible host label.
  await admin.from("ec_profiles").upsert({
    id: botId,
    email: BOT_EMAIL,
    display_name: "Your ETA · Slack",
  });

  cachedBotHostId = botId;
  return botId;
}
