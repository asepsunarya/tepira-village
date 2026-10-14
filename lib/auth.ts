import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

/**
 * Login dev tanpa Google. HANYA aktif saat NODE_ENV !== "production" DAN
 * DEV_LOGIN_EMAIL diisi. Di production provider ini tidak pernah terdaftar.
 */
const devLoginEmail =
  process.env.NODE_ENV !== "production" ? process.env.DEV_LOGIN_EMAIL?.trim() || null : null;

const devProvider = devLoginEmail
  ? [
      Credentials({
        id: "dev-login",
        name: "Dev login",
        credentials: {},
        async authorize() {
          const user = await prisma.user.upsert({
            where: { email: devLoginEmail },
            update: {},
            create: { email: devLoginEmail, name: "Dev Villager" }
          });
          return { id: user.id, email: user.email, name: user.name, image: user.image };
        }
      })
    ]
  : [];

export const isDevLoginEnabled = Boolean(devLoginEmail);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [...authConfig.providers, ...devProvider],
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    }
  }
});

export async function getRequiredUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  return userId;
}

/** Untuk server action: tanpa sesi = error dengan pesan yang tampil di desa (bukan redirect). */
export async function requireActionUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sesi habis. Silakan login lagi.");
  return userId;
}

/**
 * Identik dengan tepira: data lama tanpa userId tetap dianggap milik user
 * yang sedang login (kompatibilitas data sebelum Google login ditambahkan).
 */
export function userOwnedWhere(userId: string) {
  return { OR: [{ userId }, { userId: null }] };
}
