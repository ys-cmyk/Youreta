import Link from "next/link";

export const metadata = { title: "Sign-in link expired — Your ETA" };

export default function AuthCodeError() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-2xl text-gray-400">
        ◎
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Sign-in link expired</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm text-gray-400">
        That magic link was invalid or has already been used. Request a fresh
        one.
      </p>
      <Link
        href="/login"
        className="btn btn-primary mt-6 min-h-11 px-5 text-sm shadow-lg shadow-accent/20"
      >
        Back to sign in
      </Link>
    </div>
  );
}
