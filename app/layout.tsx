import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { DeepLinkAuthHandler } from "@/components/DeepLinkAuthHandler";

export const viewport: Viewport = { themeColor: "#0a0a0f" };

export const metadata: Metadata = {
  metadataBase: new URL("https://youreta.vercel.app"),
  title: "Your ETA",
  description:
    "Set a destination, share your ETA, and track each other on the way.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Your ETA",
  },
  icons: { icon: "/icon.svg", apple: "/apple-icon" },
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
        <DeepLinkAuthHandler />
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
