import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AccountClient from "./AccountClient";

export const metadata: Metadata = { title: "Account — Your ETA" };

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">Account</h1>

      <div className="card mt-6 p-4">
        <div className="section-label">Signed in as</div>
        <p className="mt-1 break-all text-sm text-gray-200">{user.email}</p>
      </div>

      <AccountClient />

      <p className="mt-6 text-center text-xs text-gray-500">
        Read our{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 transition-colors hover:text-gray-300"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
