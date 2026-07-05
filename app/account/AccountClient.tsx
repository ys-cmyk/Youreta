"use client";

import { useState } from "react";

export default function AccountClient() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete your account? This permanently deletes your account, the " +
          "destinations you host, and your ETAs and locations. This can't be undone."
      )
    ) {
      return;
    }
    setError("");
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not delete your account.");
      return;
    }
    window.location.assign("/login");
  }

  return (
    <div className="mt-6 space-y-6">
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          disabled={deleting}
          className="btn btn-secondary min-h-11 w-full px-4 text-sm"
        >
          Sign out
        </button>
      </form>

      <div className="card border-red-400/20 p-4">
        <div className="section-label text-red-300/80">Danger zone</div>
        <p className="mt-2 text-sm text-gray-400">
          Deleting your account permanently removes your profile, the
          destinations you host, and your ETAs and live locations. This can&apos;t
          be undone.
        </p>

        {error && (
          <p className="ec-expand mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="btn btn-danger mt-4 min-h-11 w-full px-4 text-sm"
        >
          {deleting && <span className="spinner h-3.5 w-3.5" aria-hidden />}
          {deleting ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}
