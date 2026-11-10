import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FAABRA GLOBAL TRADE",
    short_name: "FAABRA",
    description: "Business management and accounting for FAABRA GLOBAL TRADE",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f3ee",
    theme_color: "#1f664a",
    orientation: "any",
    categories: ["business", "finance"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
