export const metadata = { title: "Setup needed — Your ETA" };

export default function ConfigErrorPage() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="text-2xl font-bold tracking-tight">Setup needed</h1>
      <p className="mt-3 text-sm text-gray-400">
        This deployment can’t reach Supabase because its environment variables
        are missing or invalid. Set these in your hosting provider, then trigger
        a fresh deploy:
      </p>
      <ul className="mt-4 space-y-1 text-sm">
        <li>
          <code className="text-accent-bright">NEXT_PUBLIC_SUPABASE_URL</code>
        </li>
        <li>
          <code className="text-accent-bright">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
        </li>
        <li>
          <code className="text-accent-bright">NEXT_PUBLIC_SITE_URL</code>
        </li>
      </ul>
      <p className="mt-4 text-xs text-gray-500">
        These values are baked in at build time, so they only take effect on a
        new build after you set them.
      </p>
    </div>
  );
}
