import { dirname } from "path";
import { fileURLToPath } from "url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ada package-lock.json lain di direktori home; pastikan tracing hanya di repo ini.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // three / drei ship ESM that Next needs to transpile for the server bundle.
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }]
  },
  // Service worker pengingat (public/sw.js): selalu versi terbaru, tidak pernah dari cache.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }
        ]
      }
    ];
  }
};

export default nextConfig;
