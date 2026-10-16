/**
 * Siapa yang boleh login ke desa. Port dari lib/auth-policy.ts di tepira dengan nama env yang sama
 * (TEPIRA_DEFAULT_USER_EMAIL + TEPIRA_ALLOWED_EMAILS), supaya kedua project Vercel diisi nilai yang sama.
 *
 * Tanpa import: auth.config.ts dipakai middleware Edge, jadi file ini harus aman untuk Edge
 * (tanpa Prisma, tanpa node:*).
 */

/** id provider Credentials login dev di lib/auth.ts. */
export const DEV_LOGIN_PROVIDER_ID = "dev-login";

/**
 * Allowlist login dari env: email owner (TEPIRA_DEFAULT_USER_EMAIL) plus daftar opsional dipisah koma
 * (TEPIRA_ALLOWED_EMAILS). Tiap entri di-trim dan di-lowercase. Kalau tidak ada yang diisi, hasilnya
 * set kosong, dan set kosong tidak meloloskan siapa pun.
 */
export function parseAllowedEmails(...values: Array<string | null | undefined>): Set<string> {
  const allowed = new Set<string>();
  for (const value of values) {
    for (const entry of (value ?? "").split(",")) {
      const email = entry.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+$/.test(email)) allowed.add(email);
    }
  }
  return allowed;
}

/** Cek allowlist tanpa peduli huruf besar/kecil; selain string tidak kosong selalu gagal. */
export function isAllowedEmail(email: unknown, allowed: ReadonlySet<string>): boolean {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  return normalized !== "" && allowed.has(normalized);
}

/** Login Google: email profil harus sudah diverifikasi Google dan ada di allowlist. */
export function isAllowedGoogleProfile(
  profile: { email?: unknown; email_verified?: unknown } | null | undefined,
  allowed: ReadonlySet<string>
): boolean {
  return profile?.email_verified === true && isAllowedEmail(profile.email, allowed);
}

/**
 * Email login dev, atau null kalau login dev tidak aktif. Penjaga yang sama dengan yang sudah dipakai
 * lib/auth.ts untuk mendaftarkan provider dev: hanya saat NODE_ENV bukan "production" DAN
 * DEV_LOGIN_EMAIL diisi. Panggil dengan `process.env.NODE_ENV` apa adanya supaya Next menanamnya saat build.
 */
export function enabledDevLoginEmail(
  nodeEnv: string | undefined,
  devLoginEmail: string | undefined
): string | null {
  if (nodeEnv === "production") return null;
  return devLoginEmail?.trim() || null;
}

/** Email dev dibandingkan apa adanya (tanpa syarat format), sama seperti provider dev memakainya. */
function isDevEmail(email: unknown, devEmail: string | null): boolean {
  if (!devEmail) return false;
  return isAllowedEmail(email, new Set([devEmail.trim().toLowerCase()]));
}

/** Login dev (Credentials, tanpa profil Google): hanya provider dev, saat aktif, untuk email dev itu. */
export function isAllowedDevLogin(
  account: { provider?: unknown; type?: unknown } | null | undefined,
  user: { email?: unknown } | null | undefined,
  devEmail: string | null
): boolean {
  if (account?.provider !== DEV_LOGIN_PROVIDER_ID || account.type !== "credentials") return false;
  return isDevEmail(user?.email, devEmail);
}

/**
 * Callback signIn: login dev lewat aturan dev, selain itu aturan Google. Provider lain tanpa profil
 * Google terverifikasi selalu ditolak.
 */
export function isAllowedSignIn(
  params: {
    account?: { provider?: unknown; type?: unknown } | null;
    profile?: { email?: unknown; email_verified?: unknown } | null;
    user?: { email?: unknown } | null;
  },
  allowed: ReadonlySet<string>,
  devEmail: string | null
): boolean {
  if (params.account?.provider === DEV_LOGIN_PROVIDER_ID) {
    return isAllowedDevLogin(params.account, params.user, devEmail);
  }
  return isAllowedGoogleProfile(params.profile, allowed);
}

/**
 * Callback jwt: sesi tetap hidup hanya untuk email di allowlist, atau email login dev selama login dev
 * aktif (supaya `npm run dev` dengan DEV_LOGIN_EMAIL saja tetap jalan seperti sebelumnya). Di production
 * devEmail selalu null, jadi hanya allowlist yang berlaku.
 */
export function isAllowedSession(email: unknown, allowed: ReadonlySet<string>, devEmail: string | null): boolean {
  return isAllowedEmail(email, allowed) || isDevEmail(email, devEmail);
}
