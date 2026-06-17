import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  metadataBase: new URL("https://youreta.vercel.app"),
  title: "Your ETA",
  description:
    "Set a destination, share your ETA, and track each other on the way.",
  openGraph: {
    title: "Your ETA",
    description:
      "Set a destination, share your ETA, and track each other on the way.",
    siteName: "Your ETA",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Your ETA",
    description:
      "Set a destination, share your ETA, and track each other on the way.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
