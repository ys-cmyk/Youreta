import type { MetadataRoute } from "next";

// PWA manifest via Next's metadata convention — Next auto-links this from the
// app. No extra dependencies and no custom service worker.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Your ETA",
    short_name: "Your ETA",
    description:
      "Set a destination, share your ETA, and track each other on the way.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0f",
    theme_color: "#0a0a0f",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "maskable",
      },
    ],
  };
}
