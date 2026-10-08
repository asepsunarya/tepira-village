import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isDevLoginEnabled, signIn } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/village");

  return (
    <main className="landing">
      <div className="landing-card card narrow">
        <Link href="/" className="hud-brand">
          <span className="brand-dot">t</span>
          <div>
            <b>tepira</b> village
            <small>desa tabunganmu</small>
          </div>
        </Link>
        <h1>Masuk ke desamu</h1>
        <p>Gunakan akun Google yang sama dengan tepira.id supaya goal, dompet, dan pengeluaranmu langsung muncul.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/village" });
          }}
        >
          <button type="submit" className="google-btn">
            <span className="g">G</span> Lanjutkan dengan Google
          </button>
        </form>
        {isDevLoginEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("dev-login", { redirectTo: "/village" });
            }}
          >
            <button type="submit" className="pill dev">🛠️ Dev login (tanpa Google)</button>
          </form>
        )}
      </div>
    </main>
  );
}
