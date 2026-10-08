import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/village");

  return (
    <main className="landing">
      <div className="landing-card card">
        <div className="hud-brand">
          <span className="brand-dot">t</span>
          <div>
            <b>tepira</b> village
            <small>desa tabunganmu</small>
          </div>
        </div>
        <h1>Nabung dari hal yang <em>teu pira</em>, lihat desamu tumbuh.</h1>
        <p>
          Setiap goal tabungan jadi sebuah bangunan. Tiap setoran kecil memasang fondasi, menaikkan dinding, lalu
          memasang atap. Pengeluaran tercatat di warung, dompetmu jadi peti harta, dan skor kesehatan keuangan
          bulanan menentukan cuaca pulau.
        </p>
        <ul className="landing-list">
          <li>🏗️ Goal = bangunan yang tumbuh mengikuti progres</li>
          <li>🪙 Setoran kecil tetap dihargai: +XP, naik level desa</li>
          <li>👛 Dompet, pengeluaran, dan budget memakai data tepira.id yang sama</li>
        </ul>
        <Link href="/login" className="primary landing-cta">Masuk & lihat desaku →</Link>
        <small className="muted">Login dengan akun Google yang sama seperti di tepira.id.</small>
      </div>
    </main>
  );
}
