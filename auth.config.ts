import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Konfigurasi auth yang aman untuk Edge (dipakai middleware).
 * Provider + adapter Prisma ditambahkan di lib/auth.ts.
 */
export const protectedPaths = ["/village"];

export const authConfig = {
  providers: [
    Google({
      // Terima dua nama env: GOOGLE_CLIENT_ID (gaya tepira) atau AUTH_GOOGLE_ID (default Auth.js).
      clientId: process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET
    })
  ],
  // Error lain (mis. Configuration, AdapterError) juga ke halaman login, bukan halaman bawaan Auth.js.
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isProtected = protectedPaths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
      );
      if (!isProtected) return true;
      return Boolean(auth?.user);
    }
  }
} satisfies NextAuthConfig;
