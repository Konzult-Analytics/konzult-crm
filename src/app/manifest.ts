import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Konzult CRM",
    short_name: "Konzult",
    description: "Konzult's prospects, clients and relationships in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ee",
    theme_color: "#ff3210",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
