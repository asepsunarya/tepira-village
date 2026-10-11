import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isDevLoginEnabled, signIn } from "@/lib/auth";
import Brand from "@/components/landing/Brand";
import "../landing.css";

export const metadata: Metadata = {
  title: "Masuk · tepira village"
};

/** Auth.js mengembalikan kegagalan login ke halaman ini sebagai ?error=<tipe>. */
const ERROR_TEXT: Record<string, string> = {
  OAuthCallbackError: "Login Google dibatalkan atau gagal. Coba lagi, ya.",
  OAuthSignInError: "Login Google belum bisa dimulai. Coba lagi sebentar lagi.",
  OAuthAccountNotLinked: "Email ini sudah terhubung dengan cara login lain. Masuk dengan akun yang sama seperti di tepira.id.",
  MissingCSRF: "Sesi login kedaluwarsa. Muat ulang halaman ini, lalu coba lagi.",
  AccessDenied: "Akses ditolak untuk akun ini."
};

/** callbackUrl dari middleware berupa URL absolut: ambil path-nya saja dan hanya untuk /village. */
function safeRedirect(callbackUrl?: string) {
  if (!callbackUrl) return "/village";
  try {
    const u = new URL(callbackUrl, "http://x");
    if (u.pathname === "/village" || u.pathname.startsWith("/village/")) return u.pathname + u.search;
  } catch {
    // abaikan URL rusak
  }
  return "/village";
}

interface Props {
  searchParams: Promise<{ error?: string | string[]; callbackUrl?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const redirectTo = safeRedirect(first(params.callbackUrl));
  const error = first(params.error);
  const session = await auth();
  if (session?.user) redirect(redirectTo);

  return (
    <div className="lp lp-auth">
      <div className="lp-cloud lp-cloud-a" aria-hidden="true" />
      <div className="lp-cloud lp-cloud-b" aria-hidden="true" />
      <main className="lp-auth-main">
        <div className="lp-auth-card lp-rise">
          <div className="lp-auth-top">
            <Link href="/" className="lp-back">
              <span aria-hidden="true">←</span> Kembali
            </Link>
          </div>
          <div className="lp-auth-sky" aria-hidden="true">
            <span>☀️</span>
            <span>🌳</span>
            <span>🏡</span>
            <span>🐷</span>
            <span>🌳</span>
          </div>
          <Brand />
          <h1 className="lp-auth-title">Masuk ke desamu</h1>
          <p className="lp-auth-text">
            Gunakan akun Google yang sama dengan tepira.id supaya goal, dompet, dan pengeluaranmu langsung muncul.
          </p>
          {error && (
            <p className="lp-auth-error" role="alert">
              <span aria-hidden="true">⚠️</span> {ERROR_TEXT[error] ?? "Login gagal. Coba lagi, ya."}
            </p>
          )}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          >
            <button type="submit" className="google-btn lp-google">
              <span className="g" aria-hidden="true">
                G
              </span>
              Lanjutkan dengan Google
            </button>
          </form>
          {isDevLoginEnabled && (
            <form
              action={async () => {
                "use server";
                await signIn("dev-login", { redirectTo });
              }}
            >
              <button type="submit" className="pill dev lp-dev">🛠️ Dev login (tanpa Google)</button>
            </form>
          )}
          <p className="lp-auth-note">
            <span aria-hidden="true">🔒</span>
            <span>
              Kami cuma memakai nama, email, dan foto profil Google-mu untuk masuk. Datamu tetap satu dengan tepira.id,
              tidak disalin ke mana-mana.
            </span>
          </p>
        </div>
        <p className="lp-auth-foot">
          Belum yakin? <Link href="/#cara-kerja">Lihat dulu cara kerjanya</Link>
        </p>
      </main>
    </div>
  );
}
