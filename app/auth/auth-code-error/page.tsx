import Link from "next/link";

export default function AuthCodeError() {
  return (
    <div className="mx-auto max-w-md text-center py-16">
      <h1 className="text-2xl font-bold">Sign-in link expired</h1>
      <p className="mt-3 text-sm text-gray-400">
        That magic link was invalid or has already been used. Request a fresh one.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-bright"
      >
        Back to sign in
      </Link>
    </div>
  );
}
