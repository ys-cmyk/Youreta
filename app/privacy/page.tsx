import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Your ETA",
  description:
    "How Your ETA handles your email, destinations, ETAs, and live location.",
};

const EFFECTIVE_DATE = "July 5, 2026";

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="section-label">{label}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-gray-300">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-gray-500">Effective {EFFECTIVE_DATE}</p>

      <p className="mt-6 text-sm leading-relaxed text-gray-300">
        Your ETA lets you set a shared destination and let the people you invite
        watch each other converge on it in real time — each person&apos;s ETA
        and, if they choose, their live location. This policy explains exactly
        what we collect, who can see it, how long we keep it, and the choices you
        have. We keep it plain because the whole app is built around location,
        and you deserve to understand it.
      </p>

      <Section label="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-semibold text-gray-100">
              Your email address
            </strong>{" "}
            — used to sign you in (via a magic link or, if you choose, Google or
            Apple sign-in). A display name shown to other participants is derived
            from your email.
          </li>
          <li>
            <strong className="font-semibold text-gray-100">
              Destinations you create
            </strong>{" "}
            — the name, address, and map coordinates of a place you set as a
            destination.
          </li>
          <li>
            <strong className="font-semibold text-gray-100">ETAs</strong> — the
            estimated arrival time you set or that we compute for a destination.
          </li>
          <li>
            <strong className="font-semibold text-gray-100">
              Precise location pings
            </strong>{" "}
            — collected <em>only</em> while you have location sharing turned on
            for a destination, so the group can see you on the live map on your
            way there.
          </li>
        </ul>
      </Section>

      <Section label="How location sharing works">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Your shared location is visible only to the participants of the same
            destination — no one else.
          </li>
          <li>
            Location pings are automatically deleted after 24 hours (a daily
            database job removes old pings, and the app also prunes your own
            stale pings each time it posts a new one). The live map only ever
            uses the last 15 minutes.
          </li>
          <li>
            Sharing stops on its own based on the duration you pick — 15 minutes,
            1 hour, or until you arrive — and you can turn it off at any time.
          </li>
          <li>
            In the iOS app, background location runs only while sharing is on,
            and the system location indicator shows whenever it&apos;s active.
          </li>
        </ul>
      </Section>

      <Section label="What we don't do">
        <ul className="list-disc space-y-2 pl-5">
          <li>No advertising.</li>
          <li>No analytics or third-party tracking SDKs.</li>
          <li>We do not sell your personal data.</li>
          <li>We do not share your data with data brokers.</li>
        </ul>
      </Section>

      <Section label="Sharing between users">
        <p>
          A destination is shared by its invite link — the link is the invite.
          When you join a destination via its link, your name, your ETA, and your
          live location (if you&apos;re sharing) become visible to that
          destination&apos;s participants. That&apos;s the whole point of the app,
          and it only ever happens for destinations you&apos;ve joined.
        </p>
      </Section>

      <Section label="Service providers">
        <p>
          We rely on a small set of processors to run the app. We share only what
          each needs to do its job:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-semibold text-gray-100">Supabase</strong> —
            authentication and database hosting (your account, destinations,
            ETAs, and pings live here).
          </li>
          <li>
            <strong className="font-semibold text-gray-100">Vercel</strong> — web
            hosting and content delivery.
          </li>
          <li>
            <strong className="font-semibold text-gray-100">Resend</strong> —
            sends the transactional sign-in emails.
          </li>
          <li>
            <strong className="font-semibold text-gray-100">Google</strong> —
            only if you choose to sign in with Google.
          </li>
          <li>
            <strong className="font-semibold text-gray-100">
              Map and geo services
            </strong>{" "}
            that receive limited technical data: OpenStreetMap / CARTO serve the
            map tiles (a tile request exposes your IP address), Photon / Komoot
            handles place-search text queries, and OSRM computes travel-time ETAs
            from a start and destination coordinate. These map requests are not
            tied to your identity.
          </li>
        </ul>
      </Section>

      <Section label="Data retention & deletion">
        <ul className="list-disc space-y-2 pl-5">
          <li>Location pings are deleted after 24 hours.</li>
          <li>
            Destinations and ETAs are kept until the host deletes the destination
            or the account is deleted.
          </li>
          <li>
            You can delete your account at any time from the{" "}
            <Link
              href="/account"
              className="text-accent-bright underline underline-offset-2 transition-colors hover:text-white"
            >
              Account
            </Link>{" "}
            page. Deleting your account permanently removes your profile, the
            destinations you host, your participations, and your location pings.
          </li>
        </ul>
      </Section>

      <Section label="Children">
        <p>
          Your ETA is not directed at children under 13, and we don&apos;t
          knowingly collect personal information from them.
        </p>
      </Section>

      <Section label="Contact">
        <p>
          Questions about this policy or your data? Email us at{" "}
          <a
            href="mailto:hello@youreta.app"
            className="text-accent-bright underline underline-offset-2 transition-colors hover:text-white"
          >
            hello@youreta.app
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
