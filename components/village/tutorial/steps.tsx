import type { ReactNode } from "react";
import type { Snapshot } from "@/lib/game";
import { buildStage } from "@/lib/game";
import { monthLabel } from "@/lib/format";
import type { Panel } from "../types";
import { labelRegistry } from "../scene/labels";
import {
  newestGoal,
  newestWallet,
  salarySig,
  savedGoal,
  type TourBaseline,
  type TourHits
} from "./progress";

export interface TourCtx {
  snapshot: Snapshot;
  panel: Panel;
}

/** Kandidat sasaran spotlight. Yang dipakai: kandidat pertama yang elemennya ada di layar. */
export interface Target {
  id: string;
  /** null = tanpa spotlight (kartu saja) */
  find: (() => Element[]) | null;
  title?: string;
  body?: ReactNode;
  /** label dunia 3D: dilewati kalau tertutup panel */
  world?: boolean;
  /** perpanjang sorotan ke bawah (px) supaya bangunan di bawah label ikut terang */
  extendDown?: number;
}

export interface TourAction {
  goal: (s: Snapshot) => string;
  optional?: boolean;
  /** langkah ini bergantung pada bulan yang sedang dilihat */
  periodBound?: boolean;
  /** kondisi sudah terpenuhi → "Sudah ✓" + Lanjut, tidak perlu menunggu */
  satisfied: (s: Snapshot) => boolean;
  /** aksinya benar-benar terjadi sejak langkah dimulai → rayakan & lanjut otomatis */
  happened: (s: Snapshot, b: TourBaseline, h: TourHits) => boolean;
  alreadyLabel?: string;
  already: (s: Snapshot) => ReactNode;
  done: (s: Snapshot, b: TourBaseline, h: TourHits) => ReactNode;
  /** sasaran saat merayakan (bangunan/peti/warung di pulau) */
  celebrate?: (s: Snapshot, b: TourBaseline, h: TourHits) => Target[];
  celebrateMs?: number;
}

export interface TourStep {
  id: "welcome" | "explore" | "wallet" | "salary" | "goal" | "save" | "spend" | "recap" | "finish";
  kind: "welcome" | "info" | "action" | "finish";
  title: (s: Snapshot) => string;
  /** tiap halaman memberi daftar kandidat sasaran (langkah info bisa bertahap) */
  pages: ((c: TourCtx) => Target[])[];
  action?: TourAction;
  /** kartu di tengah layar */
  centered?: boolean;
  /** pekatnya layar gelap di luar sorotan */
  dim?: number;
}

// ── Pencari elemen ───────────────────────────────────────────────────────────

const byTour = (...ids: string[]) => () =>
  ids.map((id) => document.querySelector(`[data-tour="${id}"]`)).filter((el): el is Element => el !== null);

const T = (id: string, body: ReactNode, extra: Partial<Target> = {}): Target => ({ id, find: byTour(id), body, ...extra });

export const NO_TARGET: Target = { id: "none", find: null };

/** Label DOM di atas objek 3D (lihat scene/labels.ts). Hanya ada kalau 🏷️ Label aktif. */
const worldLabel = (labelId: string, extendDown = 0): Target => ({
  id: `world-${labelId}`,
  world: true,
  extendDown,
  find: () => {
    const el = labelRegistry.get(labelId)?.el?.firstElementChild;
    return el ? [el] : [];
  }
});

const firstName = (s: Snapshot) => s.user.name?.trim().split(/\s+/)[0] || null;
const month = (s: Snapshot) => monthLabel(s.period.month, s.period.year);

// ── Isi kartu khusus ─────────────────────────────────────────────────────────

function Welcome() {
  return (
    <ul className="tour-points">
      <li><span aria-hidden>🏗️</span> Tiap goal tabungan jadi bangunan di pulau ini.</li>
      <li><span aria-hidden>🪙</span> Setoran kecil, teu pira, bikin bangunannya tumbuh dari fondasi sampai atap.</li>
      <li><span aria-hidden>🌤️</span> Cuaca pulau ikut kesehatan keuanganmu: makin sehat, makin cerah.</li>
    </ul>
  );
}

function Recap({ s }: { s: Snapshot }) {
  const rows = [
    { icon: "👛", label: "Dompet", ok: s.wallets.length > 0, info: s.wallets.length > 0 ? `${s.wallets.length} dompet` : "belum ada" },
    { icon: "💰", label: `Alokasi gaji ${month(s)}`, ok: s.salary !== null, info: s.salary ? "sudah dibagi" : "belum" },
    { icon: "🎯", label: "Goal tabungan", ok: s.goals.length > 0, info: s.goals.length > 0 ? `${s.goals.length} kavling` : "belum ada" },
    { icon: "🪙", label: "Setoran", ok: s.totals.contributionCount > 0, info: s.totals.contributionCount > 0 ? `${s.totals.contributionCount}x` : "belum" },
    { icon: "💸", label: "Pengeluaran bulan ini", ok: s.expenses.length > 0, info: s.expenses.length > 0 ? `${s.expenses.length} catatan` : "opsional" }
  ];
  return (
    <>
      <ul className="tour-recap">
        {rows.map((r) => (
          <li key={r.label} className={r.ok ? "ok" : ""}>
            <span aria-hidden>{r.icon}</span>
            <span className="tour-recap-label">{r.label}</span>
            <b>{r.ok ? "✓" : "–"} {r.info}</b>
          </li>
        ))}
      </ul>
      <p>
        Tur ini bisa diulang kapan saja lewat tombol <b>❓</b> di kartu kiri atas. Selamat menabung, teu pira juga jadi! 🐷
      </p>
    </>
  );
}

// ── Langkah-langkah ──────────────────────────────────────────────────────────

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    kind: "welcome",
    centered: true,
    dim: 0.45,
    title: (s) => (firstName(s) ? `Selamat datang di desamu, ${firstName(s)}!` : "Selamat datang di desamu!"),
    pages: [() => [{ ...NO_TARGET, body: <Welcome /> }]]
  },
  {
    id: "explore",
    kind: "info",
    dim: 0,
    title: () => "Kenalan sama pulaumu 🏝️",
    pages: [
      () => [
        {
          ...NO_TARGET,
          body: (
            <>
              <b>Drag</b> untuk memutar pulau, <b>scroll</b> (atau cubit di HP) untuk zoom. Warung 🛒, balai desa 🏛️, dan
              nanti bangunan goal & peti dompetmu semuanya bisa <b>diklik</b>. Coba sebentar, lalu tekan Lanjut.
            </>
          )
        }
      ]
    ]
  },
  {
    id: "wallet",
    kind: "action",
    title: () => "Bikin dompet pertama 👛",
    pages: [
      (c) =>
        c.panel === "wallets"
          ? [
              T(
                "wallet-form",
                <>
                  Kasih nama (mis. <b>BCA</b> atau <b>GoPay</b>), pilih jenisnya, lalu isi saldo yang ada sekarang.
                  Terakhir tekan <b>👛 Tambah dompet</b>.
                </>
              ),
              T("wallet-new", <>Tekan <b>➕ Dompet baru</b>.</>),
              T("panel", <>Tekan <b>← Batal</b> dulu, lalu <b>➕ Dompet baru</b>.</>)
            ]
          : [
              T(
                "dock-wallets",
                <>
                  Semua uangmu tinggal di dompet: rekening bank, e-wallet, atau tunai. Tiap dompet jadi peti harta di
                  pulau. Tekan <b>👛 Dompet</b>.
                </>
              )
            ]
    ],
    action: {
      goal: () => "Tambah 1 dompet (rekening bank atau e-wallet)",
      satisfied: (s) => s.wallets.length > 0,
      happened: (s, b) => newestWallet(s, b) !== null,
      alreadyLabel: "Sudah ada ✓",
      already: (s) => <>Kamu sudah punya {s.wallets.length} dompet. Mau tambah lagi boleh, atau langsung lanjut.</>,
      done: (s, b) => (
        <>
          Dompet <b>{newestWallet(s, b)?.name ?? "baru"}</b> jadi! Peti hartanya muncul di sisi utara pulau 🧰. Ukurannya
          ikut porsi saldo.
        </>
      ),
      celebrate: (s, b) => {
        const w = newestWallet(s, b);
        return w ? [worldLabel(`wallet-${w.id}`, 40)] : [];
      },
      celebrateMs: 3200
    }
  },
  {
    id: "salary",
    kind: "action",
    title: () => "Bagi gaji bulan ini 💰",
    pages: [
      (c) =>
        c.panel === "salary"
          ? [
              {
                id: "salary-ready",
                // Pakai status "total pas" (bukan :enabled) supaya sorotan tidak loncat saat tombol disabled ketika menyimpan.
                find: () =>
                  document.querySelector('[data-tour="salary-footer"][data-ready]') ? byTour("salary-footer")() : [],
                body: (
                  <>
                    ✅ Totalnya sudah pas sama gaji. Mau geser jatah per pos? Ubah angkanya di atas. Kalau sudah oke,
                    tekan <b>💾 Simpan alokasi</b>.
                  </>
                )
              },
              {
                id: "salary-quick",
                find: byTour("salary-amount", "salary-quick"),
                body: (
                  <>
                    Isi gajimu bulan ini, lalu tekan <b>⚖️ Bagi otomatis</b> biar langsung dibagi ke 9 pos + tabungan.
                    Belum tahu angkanya? Coba <b>🧪 simulasi</b> dulu.
                  </>
                )
              },
              T("salary-form", <>Bagi gajimu ke tiap pos sampai totalnya pas, lalu tekan <b>💾 Simpan alokasi</b>.</>),
              T("salary-overview", <>Alokasi gaji bulan ini sudah ada. Bisa diubah kapan saja lewat <b>✏️ Ubah alokasi</b>.</>),
              T("panel", <>Alokasi gaji bulan ini sudah ada. Bisa diubah kapan saja lewat <b>✏️ Ubah alokasi</b>.</>)
            ]
          : [
              T(
                "dock-salary",
                <>
                  Kasih tiap rupiah gajimu tugas: makan, tagihan, hiburan, sampai tabungan. Tekan <b>💰 Gaji</b>.
                </>
              )
            ]
    ],
    action: {
      goal: (s) => `Simpan alokasi gaji ${month(s)}`,
      periodBound: true,
      satisfied: (s) => s.salary !== null,
      happened: (s, b) => s.salary !== null && salarySig(s) !== b.salarySig,
      already: (s) => <>Gaji {month(s)} sudah dibagi. Mau ubah? Buka <b>💰 Gaji</b> kapan saja.</>,
      done: (s) => (
        <>
          Gaji {month(s)} sudah punya tugas semua. Si penabung lapor ke Balai Desa 🏛️. Nanti tiap pengeluaran
          dibandingkan sama jatahnya.
        </>
      ),
      celebrate: () => [worldLabel("hall")],
      celebrateMs: 3200
    }
  },
  {
    id: "goal",
    kind: "action",
    title: () => "Buka kavling pertama 🎯",
    pages: [
      (c) =>
        c.panel === "goals"
          ? [
              T(
                "goal-form",
                <>
                  Kasih nama (mis. <b>Dana darurat</b> atau <b>Liburan</b>), isi targetnya, lalu tekan{" "}
                  <b>🏗️ Buka kavling baru</b>.
                </>
              ),
              T("goal-new", <>Tekan <b>➕ Goal baru</b>.</>),
              T("panel", <>Tekan <b>← Semua goal</b>, lalu <b>➕ Goal baru</b>.</>)
            ]
          : [T("dock-goals", <>Tiap goal tabungan jadi satu kavling di pulau. Tekan <b>🎯 Goal</b>.</>)]
    ],
    action: {
      goal: () => "Buat 1 goal tabungan",
      satisfied: (s) => s.goals.length > 0,
      happened: (s, b) => newestGoal(s, b) !== null,
      already: (s) => <>Kamu sudah punya {s.goals.length} goal. Bikin satu lagi boleh, atau langsung lanjut.</>,
      done: (s, b) => (
        <>
          Kavling <b>{newestGoal(s, b)?.title ?? "baru"}</b> sudah dibuka! Masih lahan kosong, setoran pertama bakal
          memasang fondasinya.
        </>
      ),
      celebrate: (s, b) => {
        const g = newestGoal(s, b);
        return g ? [worldLabel(`goal-${g.id}`, 70)] : [];
      },
      celebrateMs: 3400
    }
  },
  {
    id: "save",
    kind: "action",
    title: () => "Setoran pertama 🪙",
    pages: [
      (c) =>
        c.panel === "save"
          ? c.snapshot.goals.length === 0
            ? [T("save-need-goal", <>Belum ada goal. Buat dulu satu, ya, biar ada bangunan yang bisa didirikan.</>)]
            : [
                T(
                  "save-form",
                  <>
                    Pilih goal-nya, isi nominal. Rp10.000 juga boleh, teu pira! Lalu tekan <b>🪙 Setor</b>.
                  </>
                )
              ]
          : [T("dock-save", <>Saatnya isi kavlingnya. Tekan <b>🪙 Nabung</b>.</>)]
    ],
    action: {
      goal: () => "Setor ke goal-mu, sekecil apa pun",
      satisfied: (s) => s.totals.contributionCount > 0,
      // Utama: setoran berhasil lewat store; cadangan: jumlah setoran bertambah.
      happened: (s, b, h) => h.save > b.hits.save || s.totals.contributionCount > b.contributionCount,
      already: (s) => <>Kamu sudah {s.totals.contributionCount}x setor. Konsisten itu kuncinya!</>,
      done: (s, _b, h) => {
        const g = savedGoal(s, h) ?? s.goals[0];
        const stage = g ? buildStage(g.progress) : "fondasi";
        const text: Record<typeof stage, string> = {
          lahan: "Setoranmu tercatat! Bangunannya mulai disiapkan 🧱",
          fondasi: "Lihat, fondasinya terpasang! 🧱 Tiap setoran bikin bangunannya makin tinggi.",
          dinding: "Lihat, dindingnya langsung naik! 🧱 Sedikit lagi atapnya terpasang.",
          atap: "Wah, atapnya mulai dipasang! 🏠 Tinggal finishing.",
          selesai: "Bangunannya langsung jadi! 🎉 Goal pertamamu tercapai."
        };
        return text[stage];
      },
      celebrate: (s, _b, h) => {
        const g = savedGoal(s, h) ?? s.goals[0];
        return g ? [worldLabel(`goal-${g.id}`, 90)] : [];
      },
      celebrateMs: 4800
    }
  },
  {
    id: "spend",
    kind: "action",
    title: () => "Catat pengeluaran (opsional) 💸",
    pages: [
      (c) =>
        c.panel === "spend"
          ? c.snapshot.wallets.length === 0
            ? [T("spend-need-wallet", <>Pengeluaran selalu dipotong dari dompet. Buat dompet dulu, ya.</>)]
            : [
                T(
                  "spend-form",
                  <>
                    Isi nominal & kategori, pilih dompetnya, lalu tekan <b>💸 Catat</b>.
                    {c.snapshot.salary ? " Sisa jatah kategorinya dari alokasi gaji langsung kelihatan." : ""}
                  </>
                )
              ]
          : [
              T(
                "dock-spend",
                <>
                  Jajan kopi atau bayar parkir? Catat di <b>💸 Catat</b>, atau klik <b>warung 🛒</b> di pulau. Saldo
                  dompet langsung dipotong. Langkah ini boleh dilewati.
                </>
              )
            ]
    ],
    action: {
      goal: () => "Catat 1 pengeluaran",
      optional: true,
      periodBound: true,
      satisfied: (s) => s.expenses.length > 0,
      // Dari store, bukan s.expenses: tanggalnya bisa jatuh di bulan lain dari yang sedang dilihat.
      happened: (_s, b, h) => h.spend > b.hits.spend,
      already: (s) => <>Bulan ini sudah ada {s.expenses.length} pengeluaran tercatat.</>,
      done: () => <>Tercatat di warung 🛒 dan saldo dompetmu sudah dipotong. Ketahuan deh uangnya lari ke mana 😉</>,
      celebrate: () => [worldLabel("warung", 60)],
      celebrateMs: 3200
    }
  },
  {
    id: "recap",
    kind: "info",
    title: () => "Riwayat & ringkasan bulan 📊",
    pages: [
      (c) =>
        c.panel === "log"
          ? [
              T(
                "panel",
                <>
                  Semua setoran & pengeluaran bulan ini ada di sini. Salah ketik? Tekan <b>✏️</b> untuk edit atau{" "}
                  <b>🗑</b> untuk hapus, saldo dompet ikut disesuaikan.
                </>,
                { title: "Riwayat bisa diedit ✏️" }
              )
            ]
          : [
              T(
                "dock-log",
                <>
                  <b>📜 Riwayat</b> menyimpan semua setoran & pengeluaran bulan ini, dan semuanya bisa diedit kalau salah
                  ketik. Coba buka, atau tekan Lanjut.
                </>,
                { title: "Riwayat bisa diedit ✏️" }
              )
            ],
      (c) =>
        c.panel === "month"
          ? [
              T(
                "month-score",
                <>
                  Cincin ini skor kesehatan keuanganmu (0–100): dari rasio tabungan, disiplin budget, dana cadangan, dan
                  utang. Selama cuaca 🪄 Otomatis, skor ≥70 bikin pulau cerah ☀️, ≥55 berawan ⛅, di bawahnya senja 🌇.
                </>,
                { title: "Skor kesehatan & cuaca 🌤️" }
              ),
              T("panel", <>Ringkasan arus uang bulan ini: gaji, tabungan, pengeluaran, dan budget.</>, {
                title: "Skor kesehatan & cuaca 🌤️"
              })
            ]
          : [
              T(
                "dock-month",
                <>
                  <b>📊 Bulan ini</b> berisi skor kesehatan & arus uangmu. Skornya menentukan cuaca pulau. Balai desa 🏛️
                  di tengah pulau juga bisa diklik.
                </>,
                { title: "Skor kesehatan & cuaca 🌤️" }
              )
            ],
      () => {
        const body = (
          <>
            Ini ringkasan desamu. Level naik dari XP: tiap Rp10.000 yang ditabung = 1 XP, tiap setoran +5 XP, jadi setoran
            kecil yang rutin juga dihargai. Ganti bulan lewat tombol <b>‹ ›</b>.
          </>
        );
        const title = "Level & XP desa ⭐";
        // Di layar sempit kartu HUD bisa tertutup panel: tetap tampilkan penjelasannya tanpa sorotan.
        return [T("hud-stats", body, { title }), { ...NO_TARGET, body, title }];
      }
    ]
  },
  {
    id: "finish",
    kind: "finish",
    centered: true,
    dim: 0.45,
    title: () => "Desamu siap tumbuh! 🎉",
    pages: [(c) => [T("tour-replay", <Recap s={c.snapshot} />), { ...NO_TARGET, body: <Recap s={c.snapshot} /> }]]
  }
];
