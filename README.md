<p align="center"><img src="public/brand/mark.svg" width="112" height="112" alt="Logo tepira village: rumah kecil dan pohon di atas pulau yang tepinya koin emas"></p>

# tepira village

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
| Target tanggal goal           | Kejar deadline: tukang bekerja kalau sesuai jadwal, rumput liar tumbuh kalau telat, plus "Rp…/minggu" |
| Insight mingguan (Laporan)    | Surat dari Cyrene di kotak pos Balai Desa; benderanya naik kalau ada surat baru |
| Arus bulan ini (Laporan)      | 🌊 Aliran uang: sungai dari mata air gaji/bonus ke waduk desa, lalu ke tiap kategori, goal, dan sisa |
| —                             | Level desa: 1 XP per Rp10.000 ditabung + 5 XP per setoran               |
| —                             | Bangunan level: dermaga (Lv4), pasar (Lv8), mercusuar (Lv15), pulau kedua (Lv25), balon udara (Lv40) |
| —                             | Lampu jalan streak: satu per hari tercatat (7 hari terakhir); tiap 7 hari beruntun satu warga pindah ke desa |

Level, XP, streak, dan warga dihitung di client dari data yang sudah ada (tidak menambah tabel baru).

## Loop harian

Supaya desa punya alasan dibuka setiap hari, bukan hanya saat menabung:

- **Streak catatan.** Hari "tercatat" = ada pengeluaran atau setoran bertanggal hari itu, atau ditandai
  **nol pengeluaran** (tombol di panel Catat / panel desa) supaya hari hemat tidak memutus streak. Yang dihargai
  kebiasaan mencatat, bukan besar belanjanya. Tujuh lampu di samping jalan setapak mewakili 7 hari terakhir; lampu
  hari ini ada di depan Balai Desa dan berdenyut selama hari ini belum tercatat. Mencatat dengan tanggal kemarin
  tetap menyalakan lampu kemarin.
- **Warga.** Tiap kali satu deret mencapai kelipatan 7 hari, satu warga (Ujang, Euis, Dadang, …, maks. 8) pindah
  ke desa dan menetap walaupun streak-nya kemudian putus.
- **Bangunan level.** Ambangnya sama dengan pergantian gelar (`levelTitle`). Lokasi bangunan berikutnya ditandai
  papan + patok bertali; areanya dikosongkan dari pohon sejak awal supaya dekorasi tidak bergeser saat level naik.
- **Kejar deadline.** Garis jadwal ditarik lurus dari goal dibuat sampai target tanggal. Goal dianggap telat hanya
  kalau progresnya di bawah garis **dan** setoran 28 hari terakhir belum cukup cepat, jadi goal lama yang target
  tanggalnya baru diatur tidak langsung dicap telat. Target tanggal bisa diatur/diubah di detail goal (tepira hanya
  mengisinya saat goal dibuat).
- **Surat mingguan.** Insight terbaru dari tabel `WeeklyFinancialInsight` (cron tepira tiap Senin 08:00 WIB) sampai
  bulan yang dilihat. Akun tanpa insight tersimpan mendapat pratinjau dari angka bulan itu, sama seperti "Preview
  bulan ini" di halaman Laporan tepira (kalimatnya port dari `buildCyreneInsight`).
- **Perayaan.** Warga baru dan bangunan yang baru terbuka dirayakan sekali (notifikasi + toast di lokasinya),
  termasuk yang bertambah sejak kunjungan terakhir.

## Catat cepat

Kolom **⚡ Catat cepat** di atas form Catat membaca satu kalimat dan mengisi form di bawahnya setiap ketikan;
Enter langsung menyimpan. Pengurainya `lib/quick-entry.ts`: murni aturan & kata kunci, tanpa AI dan tanpa server.

| Ditulis                               | Terbaca sebagai                                                        |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `bakso 15rb gopay`                    | Rp15.000 · Makan harian · dompet GoPay · catatan "Bakso"                |
| `kemarin parkir 2rb`                  | Rp2.000 · Transport · tanggal kemarin (lampu streak kemarin ikut menyala) |
| `spotify 54.900 kartu kredit`         | Rp54.900 · Langganan · dompet kartu kredit                              |
| `kado dari bonus 200rb`               | Rp200.000 · Sosial · sumber Bonus                                       |
| `bakso 15`                            | Rp15.000 (angka tanpa satuan di bawah 1.000 dianggap ribuan)            |

- **Nominal:** `15rb`, `15 ribu`, `15k`, `1,5jt`, `1.5 juta`, `15.000`, `Rp15.000`, `500 perak`. Angka yang menempel ke
  huruf (`2x`, `im3`) diabaikan; kalau ada beberapa angka, yang bersatuan menang, kalau tidak yang terbesar.
- **Tanggal:** `hari ini`/`tadi`, `kemarin`, `kemarin lusa`, `3 hari lalu`, `tgl 10` (bulan ini, atau bulan lalu kalau
  tanggalnya belum lewat).
- **Dompet:** nama dompet (atau kata khasnya: "BCA" dari "Kartu kredit BCA"), sebutan jenis (`tunai`/`cash`, `kk`,
  `transfer`, `paylater`), boleh dengan `pakai`/`via`/`dari`. Sebutan terpanjang menang; kalau sama panjang, nama
  lengkap menang atas kata khas ("bca" → dompet "BCA", bukan "Kartu kredit BCA").
- **Kategori:** kata kunci per kategori tepira; frasa panjang dicek dulu ("pasta gigi" → Belanja kecil, bukan Kesehatan).
- Yang tidak disebut di kalimat memakai isian form sebelum mulai mengetik; menghapus kalimat mengembalikannya.
  Setelah tersimpan, dompet & kategori tetap (seperti form biasa), tanggal kembali ke bawaan.
- Ikut mode sembunyikan angka: kolomnya ikut ditutup, sama seperti kolom nominal.

### 🎤 Catat lewat suara

Tombol **🎤** di samping kolom catat cepat mengisi kolomnya dari ucapan (Web Speech API, `id-ID`), lalu kalimatnya
dibaca `parseQuickEntry` seperti yang diketik. Contoh: *"bakso lima belas ribu pakai gopay"* → `bakso Rp15.000 pakai gopay`.

- **Bilangan yang diucapkan** dinormalkan dulu oleh `lib/spoken-amount.ts`: `lima belas ribu`, `seratus lima puluh ribu`,
  `sejuta`, `satu setengah juta`, `tiga ribu lima` (= 3.500), `goceng`/`ceban`/`gopek`, `dua rebu`, `lima ratus perak`,
  `… rupiah`. Yang bernilai uang ditulis `Rp…` (nominal jelas, tidak "dianggap ribuan"); bilangan lain jadi angka biasa
  (`tiga hari yang lalu` → `3 hari yang lalu`).
- Hasil sementara langsung mengisi kolom selagi bicara. **Tidak pernah menyimpan sendiri**: cek pratinjau, lalu Enter atau
  💸 Catat. Teks yang sudah diketik sebelum menekan 🎤 tetap ada, ucapan ditambahkan di belakangnya.
- Nama dompet yang terucap terpisah tetap cocok ("go pay" → GoPay, "shopee pay" → ShopeePay), begitu juga "grab food",
  "go ride", "wi fi", "e toll". `@tempat` tidak bisa diucapkan; tempat tetap lewat 📍.
- Didukung Chrome/Edge (desktop & Android) dan Safari (macOS, iOS 14.5+). Di Firefox tombolnya tidak muncul. Hanya jalan
  di https/localhost. Audionya diproses layanan milik browser (Google untuk Chrome, Apple untuk Safari), bukan server desa.
- Tekan lagi (⏹) untuk selesai, **Esc** untuk batal. Berhenti sendiri setelah 12 detik, saat panel ditutup, atau saat angka
  disembunyikan (tombolnya ikut tersembunyi bersama kolomnya).

## Peta jajan

Pengeluaran boleh punya **tempat** (nama dan/atau titik). Tombol **🗺️ Peta jajan** (kontrol atas, atau panel Bulan
ini) membuka peta layar penuh untuk bulan yang dilihat, tata letaknya terinspirasi "Peta Oyen":
- **Peta bergaya desa** (`components/village/map/gameStyle.ts`): peta dasar digambar sendiri dari data vektor
  OpenStreetMap: daratan rumput, cincin pasir di tepi air, jalan seperti setapak, gedung balok pastel beratap
  (rumah terakota, gedung sedang pink, menara biru kaca) yang timbul di mode **3D**, label tebal berbingkai krem.
  Suasana **siang / senja / malam** mengikuti cuaca desa (atau dipilih sendiri lewat tombol suasana; tersimpan di
  browser).
- **Penanda** per tempat: lingkaran putih bercincin warna kategori + ikon, angka = jumlah catatan, label nominal di
  bawahnya. Tempat yang berdekatan di layar digabung jadi satu penanda bertumpuk; diklik = zoom ke kelompoknya.
- **Sidebar** (di HP jadi lembar di bawah peta): ganti bulan, total jajan berlokasi "di N tempat", pencarian, chip
  kategori, baris *Perjalanan* (transport tanpa tempat) & *Tanpa tempat* (→ Riwayat untuk diberi tempat), *Tempat
  langgananmu* (paling sering), *Pertama kali bulan ini* (tidak tercatat setahun sebelumnya), dan semua tempat.
- Tombol peta: zoom, **3D**, suasana, **lokasiku**, lihat semua. `Esc` atau ✕ kembali ke desa. Selama peta terbuka,
  scene 3D desa berhenti merender. Nominal ikut mode sembunyikan angka.

Cara mengisi tempat (isian **📍 Tempat** di form Catat dan di ✏️ Riwayat):
- **📍** = lokasi sekarang dari browser (perlu izin; hanya https/localhost) + nama tempat terdekat dari OpenStreetMap.
- **Enter** di kolom tempat = cari di peta (Indonesia, diutamakan yang dekat).
- **Chip** tempat yang pernah dicatat (setahun terakhir, paling sering dulu) = nama + titiknya sekaligus.
- **Catat cepat:** `kopi 20rb @toko djawa`. Kalau cocok dengan tempat yang pernah dicatat (boleh sebagian nama:
  `@kumis` → "Bakso Pak Kumis"), titiknya ikut; kalau tidak, tersimpan sebagai nama tanpa titik.

Layanan luar (tanpa API key): ubin vektor & font **OpenFreeMap** (`tiles.openfreemap.org`, data © OpenStreetMap,
skema OpenMapTiles) lewat MapLibre GL, dan **Nominatim** untuk nama tempat & pencarian. Nominatim hanya dipanggil
saat tombol/Enter ditekan, sesuai aturan pakainya (maks. 1 permintaan/detik, tanpa autocomplete). MapLibre (±250 kB)
dimuat hanya saat peta dibuka; worker-nya disalin webpack sebagai aset (`setWorkerUrl` di `components/village/map/JajanMap.tsx`).

**Butuh kolom baru di database.** Kolom `placeName`, `latitude`, `longitude` di `Expense` dimiliki repo tepira
(migrasi `20261012150000_add_expense_place`). Urutan rilis:
1. Merge PR skema di tepira, lalu jalankan `npm run migrate:deploy` di sana dengan `DATABASE_URL` produksi.
2. Baru deploy perubahan desa ini. Kalau desa jalan duluan, semua query pengeluaran gagal karena kolomnya belum ada.

Untuk DB lokal cukup `npm run db:push:dev` lagi.

## Aliran uang

Kanvas **🌊 Aliran uang** layar penuh menggambar uang bulan yang dilihat sebagai sungai (`lib/flow.ts`,
`components/village/ui/AliranView.tsx`). Dibuka dengan klik **kolam** di pulau (waduk desa), kotak *Pengeluaran bulan ini* /
*Sisa budget* di kartu kiri atas, atau tombol di panel 📊 Bulan ini.

- **Mata air:** Gaji dan Bonus. Kalau yang keluar lebih besar dari pemasukan, selisihnya mengalir dari mata air
  **🏺 Dari saldo dompet** (juga saat gaji bulan itu belum dicatat). Saldo awal bukan pemasukan, sama dengan Laporan tepira.
- **Waduk** di tengah, lalu bercabang ke:
  - tiap **kategori** pengeluaran (terbesar dulu). Label "Rp… / Rp…" = realisasi / jatah alokasi gaji; **🌊 meluap** kalau
    bagian yang bersumber gaji melewati jatah (sama dengan panel 💰 Gaji). Key kategori lama dari tepira ikut diterjemahkan.
  - tiap **goal** yang disetori bulan itu (warna pita = warna atap bangunannya; lebih dari 5 goal digabung).
  - **🐷 Disisihkan**: alokasi tabungan gaji yang belum disetor ke goal. Setoran ke goal dianggap diambil dari alokasi
    tabungan dulu, jadi tabungan tidak dihitung dobel.
  - **💧 Belum terpakai**: pemasukan − pengeluaran − tabungan (beda dengan *Sisa budget*, yang hanya menghitung jatah belanja).
- Tebal pita sebanding nominal. Klik node untuk kartu detail (jatah, berapa dari bonus, jumlah catatan, 🏡 Buka goal).
- Sidebar: total masuk, bilah Dipakai / Ditabung / Belum terpakai, daftar kategori yang meluap, ganti bulan. `Esc` atau ✕
  kembali ke desa; selama terbuka scene 3D berhenti merender. Nominal & persentase ikut mode sembunyikan angka.
- Rincian setoran per goal dihitung server (`summary.savedByGoal`), karena setoran di snapshot dipotong 30 terbaru per goal.
  Tidak ada tabel atau kolom baru.

### Kios tempat langganan & batas jajan per tempat

- **Kios di pulau.** Tempat yang dicatat minimal 2× setahun terakhir, atau yang punya batas jajan, berdiri sebagai kios
  kecil di pulau. Maksimal 8: lima di "jalan jajan" dekat warung, tiga di sudut barat laut (`KIOSK_SPOTS` di
  `layout.ts`).
  - Slot tiap kios diambil dari hash namanya (`lib/kiosks.ts`), jadi kios tidak berpindah saat urutan berubah.
  - Kios mengikuti bulan yang dilihat: makin ramai sesuai jumlah kunjungan (pembeli, bendera, lampu).
  - Bendera kuning berarti hampir batas. Kios yang lewat batas tutup: rana turun, warnanya pudar, tanamannya layu.
  - Klik kios untuk membuka peta jajan yang langsung menyorot tempat itu. Si penabung juga berjalan ke kios saat
    kamu mencatat di sana.
- **Batas jajan per tempat.** Atur lewat kartu tempat di peta jajan (🎯 Atur batas jajan).
  - Batasnya berlaku per bulan kalender, untuk semua kategori. Status "hampir batas" mulai 80%; lewat dari batas
    berarti "lewat batas".
  - Statusnya tampil di penanda peta, baris sidebar, label kios, panel Bulan ini, dan catat cepat. Contoh:
    chip 📍 berubah kuning/merah dan muncul "nominal ini bikin lewat".
  - Saat sebuah catatan menaikkan statusnya, muncul pemberitahuan tanpa menyebut nominal.
- **Penyimpanan.** Batas disimpan per user di `localStorage` (`daily.ts`, kunci `tepira-village-placelimits:v1:<email>`).
  Batas belum ikut ke perangkat lain dan tidak butuh migrasi. Sinkronisasi nanti butuh tabel baru di repo tepira.

Semua hari memakai **kalender WIB** (`wibDay` di `lib/game.ts`), sama dengan minggu insight di tepira. Server hanya
mengirim daftar hari yang punya catatan (`activityDays`, 400 hari terakhir). Tanda nol pengeluaran (hari ini dan
2 hari sebelumnya), surat yang sudah dibuka, dan warga/level yang sudah dirayakan disimpan per user di
`localStorage` (`components/village/daily.ts`), jadi belum ikut pindah antar perangkat.

## Arsitektur

```
app/
  page.tsx                landing (hero desa contoh 3D) → redirect ke /village jika sudah login
  landing.css             gaya landing & login, di-scope ke .lp (body tetap overflow:hidden untuk /village)
  login/page.tsx          login Google (Auth.js v5), opsional dev-login
  village/page.tsx        server component: auth + buildSnapshot → <VillageApp/>
  village/actions.ts      server actions: nabung, catat pengeluaran, goal (+ target tanggal), dompet, alokasi gaji (semua balikin snapshot baru)
  api/auth/[...nextauth]  handler Auth.js
lib/
  snapshot.ts             satu query gabungan + rumus skor kesehatan (disalin dari tepira/lib/report-scoring.ts)
  wallet-expenses.ts      port 1:1 dari tepira (aturan potong/kembalikan saldo dompet)
  game.ts                 tipe Snapshot, level/XP, tahap bangunan, hari WIB, streak & warga, bangunan level, kejar deadline
  quick-entry.ts          pengurai "catat cepat": kalimat → nominal, kategori, dompet, tanggal, tempat, catatan
  spoken-amount.ts        🎤 bilangan yang diucapkan → angka ("lima belas ribu" → "Rp15.000") sebelum quick-entry
  flow.ts                 aliran uang: gaji/bonus → waduk → kategori, goal, disisihkan, belum terpakai + tata letak pita SVG
  places.ts               peta jajan: pencocokan tempat, pengelompokan per tempat, warna & ikon kategori, ringkasan
                          sidebar (langganan, pertama kali, tanpa tempat), penggabungan penanda berdekatan,
                          belanja per nama tempat (spendByPlaceName)
  place-limits.ts         batas jajan per tempat: parse/simpan, status aman/hampir/lewat
  kiosks.ts               pemilihan kios tempat langganan, slot stabil (hash), keramaian
  *.test.ts               tes Node (node:test lewat tsx): `npm test`
  demo-snapshot.ts        desa contoh fiktif untuk landing (tidak pernah dikirim ke server)
  auth.ts, prisma.ts      sama polanya dengan tepira (JWT session, userOwnedWhere, connection_limit=1)
components/village/
  store.ts                zustand: snapshot dari server + preferensi visual (localStorage)
  daily.ts                localStorage per user: tanda nol pengeluaran, surat terbaca, perayaan yang sudah tampil,
                          batas jajan per tempat
  kiosks.ts, usePlaces.ts kios yang berdiri untuk snapshot ini; hook belanja per tempat, status batas, kios
  geo.ts                  lokasi sekarang (browser) + nama/pencarian tempat (Nominatim)
  speech.ts               🎤 Web Speech (SpeechRecognition id-ID): dukungan browser, hook mendengar, pesan galat
  useProgress.ts          hook: hari WIB (ganti tengah malam), streak, level/XP, surat minggu ini
  layout.ts               posisi kavling, peti dompet, warung, balai desa, jalur setapak, lampu, bangunan level, preset cuaca
  scene/                  react-three-fiber: Island, Decor, GoalBuilding, WalletChest, Warung, Hall, Villager,
                          StreetLamps, Townsfolk (warga), Unlocks (bangunan level), Mailbox, Kiosks (kios langganan)
  scene/labels.ts         label DOM yang diproyeksikan tiap frame (pengganti drei <Html>, aman di React 19)
  map/                    peta jajan: gameStyle (gaya peta desa siang/senja/malam), JajanMap (MapLibre + penanda)
  ui/                     HUD, Panels (Goal / Nabung / Catat / Dompet / Gaji / Riwayat / Bulan ini / Perkembangan desa /
                          Surat), JajanView (peta jajan layar penuh), PlaceLimit (editor & petunjuk batas jajan),
                          SalaryPanel, PlacePicker, PinGate, Tutorial, AliranView (aliran uang layar penuh),
                          VoiceButton (🎤 catat cepat)
  tutorial/               langkah & progres tur pengguna baru (localStorage per user)
components/landing/       Brand, HeroVisual (poster → 3D saat idle), DemoIsland (potongan scene, kamera berputar, tanpa input)
components/brand/Logo.tsx LogoMark "Pulau Koin" (inline SVG; versi kecil <= 48 px, versi lengkap di atasnya)
public/brand/             mark.svg, mark-small.svg (= favicon.svg), app-icon.svg (sumber apple-touch-icon & icon-192/512)
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
npm run seed:dev         # data contoh: 4 goal (1 telat jadwal, 1 lebih cepat), 4 dompet, alokasi gaji,
                         # pengeluaran hampir tiap hari (streak + 3 warga), 1 insight mingguan
npm run dev              # /login → tombol "Dev login (tanpa Google)"
```

Jangan pernah menjalankan `db:push:dev` ke database produksi; skema & migrasi dimiliki repo tepira.

### Build & deploy

```bash
npm run typecheck && npm run lint && npm test && npm run build
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
- Klik lampu, warga, bangunan level, atau baris 🔥 di kartu kiri atas → perkembangan desa. Klik kotak pos → surat mingguan.
- Klik kolam, atau kotak Pengeluaran / Sisa budget di kartu kiri atas → 🌊 aliran uang.
- ‹ › di atas untuk berpindah bulan (URL ikut berubah: `?month=&year=`).
- 👁️ / 🙈 untuk menyembunyikan angka (mode privasi), 🪄 cuaca otomatis mengikuti skor kesehatan.
