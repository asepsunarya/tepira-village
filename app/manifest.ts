import type { MetadataRoute } from "next";

/** Web app manifest (/manifest.webmanifest). Ikon digambar dari public/brand/app-icon.svg, aman untuk maskable. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "tepira village",
    short_name: "tepira",
    description: "Nabung dari hal yang teu pira, lihat desamu tumbuh.",
    start_url: "/village",
    display: "standalone",
    background_color: "#cfe9f7",
    theme_color: "#cfe9f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
