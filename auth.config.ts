import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { enabledDevLoginEmail, isAllowedSession, isAllowedSignIn, parseAllowedEmails } from "@/lib/auth-policy";

/**
 * Konfigurasi auth yang aman untuk Edge (dipakai middleware).
 * Provider + adapter Prisma ditambahkan di lib/auth.ts.
 */
export const protectedPaths = ["/village"];

// Allowlist login, nama env sama dengan tepira: owner (TEPIRA_DEFAULT_USER_EMAIL) plus daftar opsional
// dipisah koma (TEPIRA_ALLOWED_EMAILS). Keduanya kosong = tidak ada yang bisa login lewat Google.
function allowedEmails() {
  return parseAllowedEmails(process.env.TEPIRA_DEFAULT_USER_EMAIL, process.env.TEPIRA_ALLOWED_EMAILS);
}

// Email login dev; selalu null di production (penjaga yang sama dengan provider dev di lib/auth.ts).
function devEmail() {
  return enabledDevLoginEmail(process.env.NODE_ENV, process.env.DEV_LOGIN_EMAIL);
}

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
    // Hanya akun Google terverifikasi di allowlist yang boleh masuk, jadi orang asing tidak pernah
    // mendapat baris User (dan lewat userOwnedWhere ikut melihat data lama yang userId-nya NULL).
    // Jalan sebelum adapter membuat user. Ditolak = /login?error=AccessDenied.
    signIn({ account, profile, user }) {
      return isAllowedSignIn({ account, profile, user }, allowedEmails(), devEmail());
    },
    // Sesi berupa JWT, jadi dicek ulang setiap kali dibaca (middleware dan auth()): sesi yang terbit
    // sebelum allowlist ada, atau untuk email yang sudah dicoret, berakhir di sini (null = cookie dihapus).
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return isAllowedSession(token.email, allowedEmails(), devEmail()) ? token : null;
    },
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
