export const metadata = { title: "Setup needed — Your ETA" };

export default function ConfigErrorPage() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="text-2xl font-bold tracking-tight">Setup needed</h1>
      <p className="mt-2 text-sm text-gray-400">
        This deployment can’t reach Supabase because its environment variables
        are missing or invalid. Set these in your hosting provider, then trigger
        a fresh deploy:
      </p>
      <ul className="card mt-5 divide-y divide-white/5">
        <li className="px-4 py-2.5 font-mono text-[13px] text-accent-bright">
          NEXT_PUBLIC_SUPABASE_URL
        </li>
        <li className="px-4 py-2.5 font-mono text-[13px] text-accent-bright">
          NEXT_PUBLIC_SUPABASE_ANON_KEY
        </li>
        <li className="px-4 py-2.5 font-mono text-[13px] text-accent-bright">
          NEXT_PUBLIC_SITE_URL
        </li>
      </ul>
      <p className="mt-4 text-xs text-gray-500">
        These values are baked in at build time, so they only take effect on a
        new build after you set them.
      </p>
    </div>
  );
}
