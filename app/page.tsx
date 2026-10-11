import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { expenseCategories } from "@/lib/categories";
import { formatCompact } from "@/lib/format";
import { levelFor, levelTitle, villageXp, xpForLevel } from "@/lib/game";
import { DEMO_SALARY, createDemoSnapshot } from "@/lib/demo-snapshot";
import { TIME_PRESETS } from "@/components/village/layout";
import Brand from "@/components/landing/Brand";
import HeroVisual from "@/components/landing/HeroVisual";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "tepira village – desa tabunganmu" },
  description:
    "Nabung dari hal yang teu pira, lihat desamu tumbuh. Setiap goal tabungan jadi bangunan di pulau 3D yang cozy — login & data sama dengan tepira.id."
};

const STEPS = [
  {
    emoji: "🪧",
    title: "Buat goal",
    text: "Tulis mau nabung buat apa dan berapa targetnya. Desa langsung membuka kavling baru buatmu."
  },
  {
    emoji: "🪙",
    title: "Nabung teu pira",
    text: "Setor seadanya, Rp5 ribu juga boleh. Si penabung lari ke kavling dan bangunanmu bertambah tinggi."
  },
  {
    emoji: "🏡",
    title: "Desa tumbuh",
    text: "Goal 100%? Rumahnya rampung, jendela menyala, konfeti turun. Level desamu ikut naik."
  }
];

// Ambang sama dengan buildStage() di lib/game.ts.
const STAGES = [
  { emoji: "🌱", name: "Lahan kosong", range: "0%" },
  { emoji: "🧱", name: "Fondasi", range: "1–29%" },
  { emoji: "🏗️", name: "Dinding", range: "30–69%" },
  { emoji: "🛖", name: "Atap", range: "70–99%" },
  { emoji: "🏡", name: "Selesai", range: "100%" }
];

const FEATURES = [
  {
    tone: "pink",
    from: ["🎯", "Goal tabungan"],
    to: ["🏠", "Bangunan yang tumbuh"],
    text: "Lahan kosong, fondasi, dinding, atap, lalu rampung — persis mengikuti progres goal-mu."
  },
  {
    tone: "mint",
    from: ["🪙", "Setoran"],
    to: ["🏃", "Si penabung lari ke kavling"],
    text: "Muncul +Rp… di atas bangunan dan dindingnya naik sedikit. Setoran Rp5 ribu pun kelihatan hasilnya."
  },
  {
    tone: "sun",
    from: ["👛", "Dompet"],
    to: ["💰", "Peti harta"],
    text: "Ukuran peti ikut porsi saldo. Dompet utang tampil gelap bercincin merah, biar nggak kelupaan."
  },
  {
    tone: "peach",
    from: ["🧾", "Pengeluaran"],
    to: ["🛒", "Warung desa"],
    text: "Jajan dicatat di warung dan saldo dompet langsung dipotong — aturannya sama persis dengan tepira.id."
  },
  {
    tone: "sky",
    from: ["📊", "Skor kesehatan"],
    to: ["☀️", "Cuaca pulau"],
    text: "Skor keuangan bulananmu menentukan langit desa: cerah, berawan, atau senja."
  },
  {
    tone: "lilac",
    from: ["⭐", "Konsistensi"],
    to: ["🏛️", "Level desa & XP"],
    text: "1 XP tiap Rp10 ribu ditabung + 5 XP tiap setoran. Dari Pendatang Baru sampai Legenda Desa."
  }
] as const;

const WEATHER = [
  { emoji: "☀️", name: "Cerah", range: "Skor 70 ke atas", note: "Keuangan sehat, desa bermandikan matahari.", preset: TIME_PRESETS.day },
  { emoji: "⛅", name: "Berawan", range: "Skor 55–69", note: "Masih aman, tapi ada yang perlu dirapikan.", preset: TIME_PRESETS.cloudy },
  { emoji: "🌇", name: "Senja", range: "Di bawah 55", note: "Saatnya pelan-pelan menata ulang budget.", preset: TIME_PRESETS.sunset }
];

// Bobot sama dengan rumus skor di lib/snapshot.ts (disalin dari Laporan tepira).
const SCORE_PARTS = [
  { label: "Rasio tabungan", weight: 30, color: "#6cc8ad" },
  { label: "Disiplin budget", weight: 25, color: "#7cc3e8" },
  { label: "Dana darurat", weight: 25, color: "#f3c35b" },
  { label: "Bebas utang", weight: 20, color: "#f28cb4" }
];

const SYNC = [
  {
    icon: "🔑",
    title: "Akun Google yang sama",
    text: "Masuk sekali, goal, dompet, dan pengeluaranmu dari tepira.id langsung muncul di desa."
  },
  {
    icon: "🔄",
    title: "Sinkron dua arah",
    text: "Nabung di desa, kelihatan di tepira.id. Catat jajan di tepira.id, warung desa ikut ramai."
  },
  {
    icon: "🗄️",
    title: "Tanpa tabel baru",
    text: "Desa menulis ke database tepira dengan aturan yang sama persis. Level & XP dihitung dari data yang sudah ada."
  },
  {
    icon: "🙈",
    title: "Mode sembunyikan angka",
    text: "Lagi di tempat umum? Sekali ketuk, nominal di layar berubah jadi ••••."
  }
];

const FAQ = [
  {
    q: "Apakah tepira village gratis?",
    a: "Gratis. Cukup masuk pakai akun Google, tanpa biaya langganan."
  },
  {
    q: "Apakah data keuangan saya aman?",
    a: "Desa memakai login Google dan database yang sama dengan tepira.id, jadi datamu tidak disalin ke tempat lain. Lagi di tempat umum? Mode sembunyikan angka menutup nominal di layar."
  },
  {
    q: "Apa bedanya dengan tepira.id?",
    a: "tepira.id itu buku catatannya: rapi dan lengkap dengan laporan. tepira village itu versi main-mainnya: data yang sama, ditampilkan sebagai desa 3D yang tumbuh tiap kamu menabung. Pakai yang mana saja, keduanya selalu sinkron."
  },
  {
    q: "Bisa dibuka di HP?",
    a: "Bisa, langsung dari browser tanpa install. Geser untuk memutar pulau, cubit untuk zoom. Di tablet atau laptop, desanya terasa lebih lega."
  },
  {
    q: "Belum punya akun tepira.id, bisa ikut?",
    a: "Bisa. Masuk dengan Google di sini dan akunmu langsung jadi. Akun yang sama juga bisa kamu pakai untuk masuk ke tepira.id."
  },
  {
    q: "Apa sih artinya “teu pira”?",
    a: "Bahasa Sunda untuk “nggak seberapa”. Idenya sederhana: uang yang terasa teu pira — kopi sore, ongkir dadakan — kalau dikumpulkan bisa jadi rumah impian di desamu."
  }
];

const GROUP_COLORS: Record<string, string> = {
  "Kebutuhan wajib": "#7cc3e8",
  "Kewajiban & rutin": "#b391f0",
  "Hiburan & fleksibel": "#f0a06a",
  Tabungan: "#6cc8ad"
};

/** Alokasi gaji contoh, dikelompokkan seperti form budget tepira. */
function salaryGroups() {
  const groupOf = new Map<string, string>(expenseCategories.map((c) => [c.label, c.group]));
  const totals = new Map<string, number>();
  for (const a of DEMO_SALARY.allocations) {
    const group = groupOf.get(a.category) ?? "Lainnya";
    totals.set(group, (totals.get(group) ?? 0) + a.amount);
  }
  totals.set("Tabungan", DEMO_SALARY.savingsAllocation);
  return [...totals].map(([label, amount]) => ({
    label,
    amount,
    pct: Math.round((amount / DEMO_SALARY.amount) * 100),
    color: GROUP_COLORS[label] ?? "#e0b48c"
  }));
}

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/village");

  const demo = createDemoSnapshot();
  const health = demo.summary.health;
  const xp = villageXp(demo.totals.totalSaved, demo.totals.contributionCount);
  const level = levelFor(xp);
  const levelPct = Math.round(((xp - xpForLevel(level)) / Math.max(1, xpForLevel(level + 1) - xpForLevel(level))) * 100);
  const groups = salaryGroups();
  const year = new Date().getFullYear();

  return (
    <div className="lp">
      <a className="lp-skip" href="#isi">
        Langsung ke isi
      </a>

      <header className="lp-top">
        <div className="lp-top-bar">
          <Brand />
          <nav className="lp-nav" aria-label="Navigasi utama">
            <a href="#cara-kerja">Cara kerja</a>
            <a href="#fitur">Fitur</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link href="/login" className="lp-btn lp-btn-soft lp-top-cta">
            Masuk
          </Link>
        </div>
      </header>

      <main id="isi" className="lp-main">
        {/* ---------- hero ---------- */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-cloud lp-cloud-a" aria-hidden="true" />
          <div className="lp-cloud lp-cloud-b" aria-hidden="true" />
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow lp-rise">
                <span aria-hidden="true">🏡</span> Versi cozy dari tepira.id
              </p>
              <h1 id="hero-title" className="lp-h1">
                Nabung dari hal yang <em>teu pira</em>, lihat desamu tumbuh.
              </h1>
              <p className="lp-lead lp-rise" style={{ animationDelay: "80ms" }}>
                Setiap goal tabungan jadi bangunan di pulau kecilmu. Setor Rp10 ribu pun dihitung: fondasi terpasang,
                dinding naik, atap jadi — sampai rumahnya rampung dan benderanya berkibar.
              </p>
              <div className="lp-actions lp-rise" style={{ animationDelay: "160ms" }}>
                <Link href="/login" className="lp-btn lp-btn-primary lp-btn-lg">
                  Mulai bangun desamu <span aria-hidden="true">→</span>
                </Link>
                <a href="#cara-kerja" className="lp-btn lp-btn-ghost lp-btn-lg">
                  Lihat cara kerjanya
                </a>
              </div>
              <p className="lp-trust lp-rise" style={{ animationDelay: "240ms" }}>
                <span aria-hidden="true">🔑</span> Login dengan akun Google yang sama seperti tepira.id · gratis
              </p>
            </div>

            <div className="lp-hero-visual lp-rise" style={{ animationDelay: "120ms" }}>
              <HeroVisual />
              <div className="lp-float lp-float-toast" aria-hidden="true">
                <b>+Rp10 rb</b>
                <small>setoran teu pira ✨</small>
              </div>
              <div className="lp-float lp-float-weather" aria-hidden="true">
                <span className="lp-float-emoji">☀️</span>
                <span>
                  <b>Cerah</b>
                  <small>skor {health.score} · {health.status.toLowerCase()}</small>
                </span>
              </div>
              <div className="lp-float lp-float-level" aria-hidden="true">
                <span className="lv">Lv{level}</span>
                <span className="lp-float-level-main">
                  <b>{levelTitle(level)}</b>
                  <span className="lp-meter">
                    <span style={{ width: `${levelPct}%` }} />
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- cara kerja ---------- */}
        <section id="cara-kerja" className="lp-section" aria-labelledby="cara-kerja-title">
          <div className="lp-wrap">
            <header className="lp-head lp-reveal">
              <p className="lp-kicker">Cara kerja</p>
              <h2 id="cara-kerja-title" className="lp-h2">Tiga langkah, tanpa ribet</h2>
              <p className="lp-sub">Nggak perlu jago atur keuangan. Cukup rutin setor, sekecil apa pun.</p>
            </header>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="lp-step lp-reveal">
                  <span className="lp-step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="lp-step-art" aria-hidden="true">
                    {s.emoji}
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>

            <div className="lp-stages lp-reveal">
              <h3 className="lp-stages-title">Tahap bangunan mengikuti progres goal</h3>
              <ol className="lp-stage-list">
                {STAGES.map((s) => (
                  <li key={s.name}>
                    <span className="lp-stage-dot" aria-hidden="true">
                      {s.emoji}
                    </span>
                    <b>{s.name}</b>
                    <small>{s.range}</small>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ---------- di tepira → di desa ---------- */}
        <section id="fitur" className="lp-section lp-sheet" aria-labelledby="fitur-title">
          <div className="lp-wrap">
            <header className="lp-head lp-reveal">
              <p className="lp-kicker">Di tepira → di desa</p>
              <h2 id="fitur-title" className="lp-h2">
                Data <span className="lp-nowrap">tepira-mu</span>, versi desa
              </h2>
              <p className="lp-sub">
                Semua yang kamu catat di tepira.id punya wujudnya sendiri di pulau. Angkanya sama, rasanya beda.
              </p>
            </header>
            <ul className="lp-features">
              {FEATURES.map((f) => (
                <li key={f.from[1]} className={`lp-feature tone-${f.tone} lp-reveal`}>
                  <div className="lp-map">
                    <span className="lp-map-from">
                      <span aria-hidden="true">{f.from[0]}</span> {f.from[1]}
                    </span>
                    <span className="lp-map-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="lp-sr">menjadi</span>
                  </div>
                  <h3>
                    <span aria-hidden="true">{f.to[0]}</span> {f.to[1]}
                  </h3>
                  <p>{f.text}</p>
                </li>
              ))}
              <li className="lp-feature lp-feature-wide tone-mint lp-reveal">
                <div className="lp-feature-wide-copy">
                  <div className="lp-map">
                    <span className="lp-map-from">
                      <span aria-hidden="true">💼</span> Alokasi gaji
                    </span>
                    <span className="lp-map-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="lp-sr">menjadi</span>
                    <span className="lp-new">Baru</span>
                  </div>
                  <h3>
                    <span aria-hidden="true">🧺</span> Budget per kategori
                  </h3>
                  <p>
                    Gajian? Bagi dulu ke pos-posnya: makan, transport, kos, sampai tabungan. Sisa budget di warung dan
                    skor cuaca langsung ikut menyesuaikan — tersimpan di alokasi yang sama dengan tepira.id.
                  </p>
                </div>
                <figure className="lp-salary">
                  <figcaption>
                    <span>Contoh gaji bulan ini</span>
                    <b>{formatCompact(DEMO_SALARY.amount)}</b>
                  </figcaption>
                  <div className="lp-split" aria-hidden="true">
                    {groups.map((g) => (
                      <span key={g.label} style={{ width: `${g.pct}%`, background: g.color }} />
                    ))}
                  </div>
                  <ul className="lp-split-legend">
                    {groups.map((g) => (
                      <li key={g.label}>
                        <i style={{ background: g.color }} aria-hidden="true" />
                        <span>{g.label}</span>
                        <b>{formatCompact(g.amount)}</b>
                        <small>{g.pct}%</small>
                      </li>
                    ))}
                  </ul>
                </figure>
              </li>
            </ul>
          </div>
        </section>

        {/* ---------- cuaca ---------- */}
        <section className="lp-section" aria-labelledby="cuaca-title">
          <div className="lp-wrap lp-split-2">
            <div className="lp-reveal">
              <p className="lp-kicker">Skor kesehatan</p>
              <h2 id="cuaca-title" className="lp-h2">Skor keuanganmu jadi cuaca pulau</h2>
              <p className="lp-sub">
                Tiap bulan, tabungan, disiplin budget, dana darurat, dan utang dirangkum jadi satu skor — rumusnya sama
                dengan halaman Laporan di tepira.id. Desamu ikut merasakannya.
              </p>
              <div className="lp-score">
                <div className="lp-split" aria-hidden="true">
                  {SCORE_PARTS.map((p) => (
                    <span key={p.label} style={{ width: `${p.weight}%`, background: p.color }} />
                  ))}
                </div>
                <ul className="lp-split-legend">
                  {SCORE_PARTS.map((p) => (
                    <li key={p.label}>
                      <i style={{ background: p.color }} aria-hidden="true" />
                      <span>{p.label}</span>
                      <b>{p.weight}%</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <ul className="lp-weather" aria-label="Cuaca berdasarkan skor">
              {WEATHER.map((w) => (
                <li
                  key={w.name}
                  className="lp-sky lp-reveal"
                  style={{ background: `linear-gradient(160deg, #fff 0%, ${w.preset.bg} 55%, ${w.preset.sea} 130%)` }}
                >
                  <span className="lp-sky-emoji" aria-hidden="true">
                    {w.emoji}
                  </span>
                  <span className="lp-sky-main">
                    <b>{w.name}</b>
                    <small>{w.note}</small>
                  </span>
                  <span className="lp-sky-range">{w.range}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- satu data ---------- */}
        <section id="data" className="lp-section" aria-labelledby="data-title">
          <div className="lp-wrap">
            <div className="lp-sync lp-reveal">
              <header className="lp-head">
                <p className="lp-kicker">Satu data dengan tepira.id</p>
                <h2 id="data-title" className="lp-h2">Satu akun, satu data, dua cara menikmatinya</h2>
              </header>
              <div className="lp-diagram" aria-hidden="true">
                <span className="lp-node">
                  <span className="lp-node-icon">📒</span>
                  <span className="lp-node-text">
                    <b>tepira.id</b>
                    <small>catat & laporan</small>
                  </span>
                </span>
                <span className="lp-link">⇄</span>
                <span className="lp-node lp-node-db">
                  <span className="lp-node-icon">🗄️</span>
                  <span className="lp-node-text">
                    <b>1 database</b>
                    <small>login Google yang sama</small>
                  </span>
                </span>
                <span className="lp-link">⇄</span>
                <span className="lp-node">
                  <span className="lp-node-icon">🏝️</span>
                  <span className="lp-node-text">
                    <b>tepira village</b>
                    <small>main & lihat tumbuh</small>
                  </span>
                </span>
              </div>
              <ul className="lp-sync-list">
                {SYNC.map((s) => (
                  <li key={s.title}>
                    <span className="lp-sync-icon" aria-hidden="true">
                      {s.icon}
                    </span>
                    <span>
                      <b>{s.title}</b>
                      <span>{s.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="lp-section" aria-labelledby="faq-title">
          <div className="lp-wrap lp-faq-wrap">
            <header className="lp-head lp-reveal">
              <p className="lp-kicker">FAQ</p>
              <h2 id="faq-title" className="lp-h2">Yang sering ditanyakan</h2>
            </header>
            <div className="lp-faq">
              {FAQ.map((f) => (
                <details key={f.q} className="lp-reveal">
                  <summary>
                    <span>{f.q}</span>
                    <span className="lp-faq-icon" aria-hidden="true" />
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- CTA penutup ---------- */}
        <section className="lp-section lp-final" aria-labelledby="final-title">
          <div className="lp-wrap">
            <div className="lp-final-card lp-reveal">
              <span className="lp-final-art" aria-hidden="true">
                🏡🌳🐷
              </span>
              <h2 id="final-title" className="lp-h2">Kavling pertamamu sudah menunggu.</h2>
              <p className="lp-sub">Mulai dari setoran yang teu pira hari ini — besok dindingnya sudah naik sedikit.</p>
              <Link href="/login" className="lp-btn lp-btn-primary lp-btn-lg">
                Mulai bangun desamu <span aria-hidden="true">→</span>
              </Link>
              <p className="lp-trust">Gratis · login dengan Google</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <div className="lp-foot-brand">
            <Brand />
            <p>Nabung dari hal yang teu pira, lihat desamu tumbuh.</p>
          </div>
          <nav className="lp-foot-nav" aria-label="Tautan bawah">
            <a href="#cara-kerja">Cara kerja</a>
            <a href="#faq">FAQ</a>
            <Link href="/login">Masuk</Link>
            <a href="https://tepira.id" target="_blank" rel="noopener noreferrer">
              tepira.id <span aria-hidden="true">↗</span>
              <span className="lp-sr">(tab baru)</span>
            </a>
          </nav>
          <p className="lp-foot-copy">© {year} tepira · dibuat untuk para penabung teu pira 🧡</p>
        </div>
      </footer>
    </div>
  );
}
