# 🏡 tepira village

Versi **interaktif & cozy** dari [tepira.id](https://github.com/asepsunarya/tepira): pulau pastel 3D low-poly
tempat setiap goal tabungan jadi bangunan yang tumbuh tiap kamu menyetor. Pengeluaran tercatat di warung,
dompet jadi peti harta, dan skor kesehatan keuangan bulanan menentukan cuaca pulau.

> Repo ini **memakai backend tepira yang sama** (database Postgres + login Google yang sama). Tidak ada
> perubahan apa pun yang dibutuhkan di repo tepira. Data yang tampil di sini = data yang tampil di tepira.id,
> dan sebaliknya.

## Konsep "game"

| Hal di tepira                 | Di desa                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| Goal tabungan                 | Kavling + bangunan. 0% lahan kosong → fondasi → dinding → atap → selesai |
| Setoran (contribution)        | Si penabung lari ke kavling, muncul `+Rp…`, bangunan bertambah tinggi   |
| Goal 100%                     | Bangunan rampung: cerobong, bendera, jendela menyala, konfeti 🎉         |
| Dompet (wallet)               | Peti harta di sisi utara. Ukuran ikut porsi saldo, dompet utang merah   |
| Pengeluaran (expense)         | Si penabung ke Warung, `-Rp…`, saldo dompet dipotong (aturan tepira)    |
| Alokasi gaji                  | Panel 💰 Gaji: bagi gaji ke 9 kategori + tabungan (total harus pas), jatah vs realisasi per kategori. Disimpan dengan aturan `createSalaryBudget` tepira |
| Bonus / saldo awal            | Dibaca untuk sisa budget & skor; masih diatur lewat tepira.id           |
| Skor kesehatan (Laporan)      | Cincin skor di Balai Desa + cuaca otomatis (≥70 cerah, ≥55 berawan, <55 senja) |
| —                             | Level desa: 1 XP per Rp10.000 ditabung + 5 XP per setoran               |

Level & XP dihitung di client dari data yang sudah ada (tidak menambah tabel baru).

## Arsitektur

```
app/
  page.tsx                landing (hero desa contoh 3D) → redirect ke /village jika sudah login
  landing.css             gaya landing & login, di-scope ke .lp (body tetap overflow:hidden untuk /village)
  login/page.tsx          login Google (Auth.js v5), opsional dev-login
  village/page.tsx        server component: auth + buildSnapshot → <VillageApp/>
  village/actions.ts      server actions: nabung, catat pengeluaran, goal, dompet, alokasi gaji (semua balikin snapshot baru)
  api/auth/[...nextauth]  handler Auth.js
lib/
  snapshot.ts             satu query gabungan + rumus skor kesehatan (disalin dari tepira/lib/report-scoring.ts)
  wallet-expenses.ts      port 1:1 dari tepira (aturan potong/kembalikan saldo dompet)
  game.ts                 tipe Snapshot, level/XP, tahap bangunan
  demo-snapshot.ts        desa contoh fiktif untuk landing (tidak pernah dikirim ke server)
  auth.ts, prisma.ts      sama polanya dengan tepira (JWT session, userOwnedWhere, connection_limit=1)
components/village/
  store.ts                zustand: snapshot dari server + preferensi visual (localStorage)
  layout.ts               posisi kavling, peti dompet, warung, balai desa, jalur setapak, preset cuaca
  scene/                  react-three-fiber: Island, Decor, GoalBuilding, WalletChest, Warung, Hall, Villager
  scene/labels.ts         label DOM yang diproyeksikan tiap frame (pengganti drei <Html>, aman di React 19)
  ui/                     HUD, Panels (Goal / Nabung / Catat / Dompet / Gaji / Riwayat / Bulan ini), SalaryPanel, PinGate, Tutorial
  tutorial/               langkah & progres tur pengguna baru (localStorage per user)
components/landing/       Brand, HeroVisual (poster → 3D saat idle), DemoIsland (potongan scene, kamera berputar, tanpa input)
prisma/schema.prisma      SALINAN skema tepira — repo ini tidak punya migrasi sendiri
```

Alur data: halaman `/village` dirender di server dengan snapshot awal → client menyimpan di zustand → setiap aksi
memanggil server action yang menulis ke DB **dengan aturan yang sama persis dengan tepira** lalu mengembalikan
snapshot terbaru, sehingga desa langsung ter-update dalam satu round-trip.

## Menjalankan

```bash
npm install
cp .env.example .env     # isi DATABASE_URL (sama dengan tepira), AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET
npm run dev              # http://localhost:3000
```

#### Mengambil env dari project Vercel tepira

```bash
vercel link              # pilih project "tepira"
vercel env pull .env.local
```

`vercel env pull` hanya mengambil env yang **bukan Secret** dan env untuk environment **Development**.
Nilai yang ditandai Secret (mis. `DATABASE_URL`, `GOOGLE_CLIENT_SECRET`) tidak ikut dan harus diambil dari
sumber aslinya:

- **Supabase** → Settings → API (dan Settings → Database untuk connection string)
- **Google Cloud Console** → APIs & Services → Credentials (OAuth client)

`.env.local` sudah di-ignore oleh git. Next.js membaca `.env.local` (dan memprioritaskannya di atas `.env`),
tapi CLI Prisma (`db:push:dev`) hanya membaca `.env`.

### Variabel environment

| Nama                         | Keterangan                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`               | **Sama dengan tepira** (Supabase/Neon). Ini yang membuat datanya satu.                      |
| `AUTH_SECRET`                | Boleh berbeda dari tepira (cookie per domain). `openssl rand -base64 32`                    |
| `AUTH_URL`                   | URL app ini, mis. `http://localhost:3000`                                                   |
| `GOOGLE_CLIENT_ID/SECRET`    | Boleh pakai OAuth client yang sama dengan tepira; **tambahkan redirect URI** `<AUTH_URL>/api/auth/callback/google`. Nama `AUTH_GOOGLE_ID/SECRET` juga diterima. |
| `APP_PIN` (opsional)         | Sama seperti tepira: angka disembunyikan sampai PIN dimasukkan.                            |
| `DEV_LOGIN_EMAIL` (dev saja) | Login tanpa Google di `npm run dev`. Diabaikan total saat `NODE_ENV=production`.           |

### Development lokal tanpa Supabase

```bash
createdb tepira_village_dev
# .env → DATABASE_URL="postgresql://localhost:5432/tepira_village_dev", DEV_LOGIN_EMAIL="dev@tepira.local"
npm run db:push:dev      # membuat tabel dari salinan skema (HANYA untuk DB lokal)
npm run seed:dev         # data contoh: 4 goal, 4 dompet, alokasi gaji, beberapa pengeluaran
npm run dev              # /login → tombol "Dev login (tanpa Google)"
```

Jangan pernah menjalankan `db:push:dev` ke database produksi; skema & migrasi dimiliki repo tepira.

### Build & deploy

```bash
npm run typecheck && npm run lint && npm run build
```

Deploy ke Vercel seperti tepira. `postinstall` menjalankan `prisma generate`.

Supaya env tidak perlu disalin ulang antar project, pakai **Shared Environment Variables**: di halaman
Environment Variables buka tab **Shared**, masukkan nilainya sekali (mis. `DATABASE_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`), lalu tautkan ke project `tepira` dan `tepira-village`. Kedua project akan memakai
nilai yang sama. Env yang memang harus berbeda (`AUTH_URL`, opsional `AUTH_SECRET`) tetap diset per project.
Opsional: `NEXT_PUBLIC_SITE_URL` (mis. `https://desa.contoh.id`) untuk URL absolut gambar pratinjau link (og:image);
tanpa itu dipakai domain produksi Vercel.
Koneksi Prisma otomatis diberi `connection_limit=1` untuk serverless (sama dengan tepira).

## Kalau skema tepira berubah

1. Salin ulang `prisma/schema.prisma` dari repo tepira (pertahankan komentar header).
2. `npm run prisma:generate`, lalu `npm run typecheck`.
3. Kalau tepira mengubah aturan bisnis di `lib/wallet-expenses.ts` atau `lib/report-scoring.ts`, port ulang ke
   `lib/wallet-expenses.ts` dan `lib/snapshot.ts` di sini supaya kedua app tetap konsisten.

## Tur untuk pengguna baru

Pengguna baru otomatis disambut **tur desa** interaktif
(`components/village/ui/Tutorial.tsx`, langkah di `components/village/tutorial/steps.tsx`): sorotan menunjuk UI asli
lewat atribut `data-tour`, lalu tiap langkah aksi **menunggu kamu benar-benar melakukannya** (buat dompet → bagi gaji →
buka goal → setor pertama → catat pengeluaran opsional) dan lanjut sendiri begitu snapshot dari server menunjukkan
aksinya berhasil. Langkah yang sudah terpenuhi tampil "Sudah ✓". Desa tetap bisa dipakai selama tur (lapisan gelapnya
tidak menangkap klik).

- "Baru" dinilai server sekali saat `/village` dimuat (`isNewVillager` di `lib/snapshot.ts`): akun dibuat ≤14 hari lalu
  **dan** belum punya satu pun goal/dompet/pengeluaran/gaji/bonus/saldo awal dengan `userId` miliknya. Baris lama tanpa
  pemilik (`userId` null) sengaja tidak dihitung karena terlihat oleh semua akun.

- Progres disimpan per user di `localStorage` (`tepira-village-tour:v1:<email>` → `{ status, step }`), **bukan** di
  database. Tur yang belum selesai dilanjutkan saat reload; user lama tidak pernah dimulai otomatis.
- Tombol ❓ di kartu kiri atas mengulang tur kapan saja. `Esc` menutup tur (kecuali saat mengetik di kolom isian),
  `Enter`/`→` = Lanjut di langkah info.
- Kalau `APP_PIN` aktif, tur baru muncul setelah PIN dibuka.

## Kontrol

- Drag untuk memutar, scroll/pinch untuk zoom, klik kanan/⇧+drag untuk geser. 🎯 Reset view mengembalikan sudut awal.
- Klik bangunan goal → detail goal. Klik peti → dompet. Klik warung → catat pengeluaran. Klik balai desa / si penabung → ringkasan bulan.
- ‹ › di atas untuk berpindah bulan (URL ikut berubah: `?month=&year=`).
- 👁️ / 🙈 untuk menyembunyikan angka (mode privasi), 🪄 cuaca otomatis mengikuti skor kesehatan.
