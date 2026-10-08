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
  }
};

export default nextConfig;
