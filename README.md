<p align="center"><img src="public/brand/mark.svg" width="112" height="112" alt="Logo tepira village: rumah kecil dan pohon di atas pulau yang tepinya koin emas"></p>

# tepira village

Versi **interaktif & cozy** dari [tepira.id](https://github.com/asepsunarya/tepira): pulau pastel 3D low-poly
tempat setiap goal tabungan jadi bangunan yang tumbuh tiap kamu menyetor. Pengeluaran tercatat di warung,
dompet jadi peti harta, dan skor kesehatan keuangan bulanan menentukan cuaca pulau.

> Repo ini **memakai backend tepira yang sama** (database Postgres + login Google yang sama). Data yang tampil
> di sini = data yang tampil di tepira.id, dan sebaliknya. Skema & migrasi tetap milik repo tepira: kolom/tabel
> yang hanya dipakai desa (tempat pengeluaran, data desa yang sinkron antar perangkat, tagihan rutin, langganan pengingat)
> juga dibuat lewat migrasi di sana, jadi **migrasinya harus jalan di produksi sebelum desa di-deploy** (lihat
> [Sinkron antar perangkat](#sinkron-antar-perangkat), [Tagihan rutin & Pak Pos](#tagihan-rutin--pak-pos), dan
> [Pengingat](#pengingat-web-push)).

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
| —                             | 📮 Pak Pos: tagihan & setoran rutin (langganan, kos, cicilan, nabung mingguan) diantar ke kotak pos saat jatuh tempo; yang ⚡ otomatis langsung tercatat |
| Arus bulan ini (Laporan)      | 🌊 Aliran uang: sungai dari mata air gaji/bonus ke waduk desa, lalu ke tiap kategori, goal, dan sisa |
| —                             | Level desa: 1 XP per Rp10.000 ditabung + 5 XP per setoran               |
| —                             | Bangunan level: dermaga (Lv4), pasar (Lv8), mercusuar (Lv15), pulau kedua (Lv25), balon udara (Lv40) |
| —                             | Lampu jalan streak: satu per hari tercatat (7 hari terakhir); tiap 7 hari beruntun satu warga pindah ke desa |
| —                             | Musim pulau ikut bulan yang dilihat (hujan, panen, kemarau, mangga) + 📔 jurnal tahun ini "hari ke-N dari 365" |
| —                             | 🔔 Pengingat di HP/laptop: 📬 tukang pos membawa tagihan (pagi), 💡 lampu hari ini belum menyala (malam); hanya jumlah, tanpa nominal |

Level, XP, streak, dan warga dihitung di client dari data yang sudah ada. Yang ditambahkan desa sendiri (tanda nol
pengeluaran, warga/level yang sudah dirayakan, surat terbaca, progres tur, batas jajan, tagihan rutin, pilihan pengingat) tersimpan
di akun dan ikut ke perangkat lain, lihat [Sinkron antar perangkat](#sinkron-antar-perangkat). Langganan pengingat sendiri per
perangkat (satu baris per browser), lihat [Pengingat](#pengingat-web-push).

## Loop harian

Supaya desa punya alasan dibuka setiap hari, bukan hanya saat menabung:

- **Streak catatan.** Hari "tercatat" = ada pengeluaran atau setoran bertanggal hari itu, atau ditandai
  **nol pengeluaran** (tombol di panel Catat / panel desa) supaya hari hemat tidak memutus streak. Yang dihargai
  kebiasaan mencatat, bukan besar belanjanya. Tujuh lampu di samping jalan setapak mewakili 7 hari terakhir; lampu
  hari ini ada di depan Balai Desa dan berdenyut selama hari ini belum tercatat. Mencatat dengan tanggal kemarin
  tetap menyalakan lampu kemarin. Tagihan rutin yang dicatat **otomatis** oleh Pak Pos tidak menyalakan lampu (yang
  dihargai kebiasaan mencatat); tagihan yang kamu Catat sendiri dari kotak pos menyalakan lampu hari jatuh temponya.
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
- **Perayaan.** Warga baru dan bangunan yang baru terbuka dirayakan sekali per akun (notifikasi + toast di lokasinya),
  termasuk yang bertambah sejak kunjungan terakhir. Yang sudah dirayakan di HP tidak dirayakan lagi di laptop.

## Jurnal tahun & musim pulau

**Musim** mengikuti bulan yang dilihat (sama seperti cuaca dan kios), jadi ‹ › sekaligus jalan-jalan antar musim. Empat
musim ala Indonesia (`lib/season.ts`, tampilannya di `components/village/seasons.ts` dan `scene/Seasons.tsx`):

| Bulan   | Musim            | Di pulau                                                                                                   |
| ------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Nov–Feb | 🌧️ Musim hujan   | Rumput paling hijau, kolam penuh, genangan di setapak; gerimis saat berawan/malam, pelangi saat cerah, kunang-kunang saat senja/malam |
| Mar–Apr | 🌾 Musim panen   | Rumput keemasan, jerami & karung beras di pelataran Balai Desa, kupu-kupu saat siang                      |
| Mei–Agu | ☀️ Musim kemarau | Rumput & daun menguning, sebagian pohon meranggas, bunga tinggal separuh, kolam surut, layangan; Agustus: bendera merah-putih di lampu jalan |
| Sep–Okt | 🥭 Musim mangga  | Pohon berbuah mangga, daun berguguran, layangan, sekeranjang mangga di pelataran                         |

- Musim hanya mengubah warna & skala saat render (rumput, mahkota pohon, kolam) plus efek kecil. Tata letak dekorasi,
  langit/laut/cahaya (milik cuaca skor), dan warna tanda bahaya (rumput liar, kios layu) tidak berubah. Landing tidak ikut.
- Efek bergerak (hujan, kunang-kunang, daun, kupu-kupu) tidak tampil kalau sistem meminta *kurangi gerakan*; layangan dan
  bendera diam. Hujan, pelangi, kunang-kunang, layangan, kupu-kupu, dan daun gugur bisa dimatikan di jurnal (`ui.reduceFx`,
  tersimpan di browser); warna pulau (termasuk mangga & pohon meranggas), genangan, pojok musim, dan bendera tetap tampil.

**📔 Jurnal tahun ini** (panel samping) memakai **hari ini (WIB)**: cincin "Hari ke-286 dari 365", musim sekarang dan
pergantian berikutnya ("Musim hujan mulai 1 Nov, 19 hari lagi"), pita 12 bulan (klik = pindah ke bulan itu), kalender
kebiasaan 12×31 dari hari tercatat + tanda nol pengeluaran (hari sebelum catatan pertama dalam 400 hari terakhir = "belum ada
data", tidak dihitung terlewat), dan
angka tahun ini: hari tercatat, deret terpanjang & sekarang (sejak 1 Januari), goal dibuat, warga, level. Dibuka dari label bulan di kontrol
atas (emoji musim di atasnya), chip di 🏝️ Perkembangan desa, atau pojok musim di samping Balai Desa. Tanpa query tambahan:
datanya `activityDays` (400 hari) dan tanda nol pengeluaran (`snapshot.sync`) yang sudah dikirim untuk lampu streak.

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
  - tiap **kategori** pengeluaran (terbesar dulu). Label "Rp… / Rp…" = realisasi bersumber gaji / jatah alokasi gaji (sama
    dengan panel 💰 Gaji, "+🎁" kalau ada yang dibayar dari bonus); **🌊 meluap** kalau realisasi gaji melewati jatah. Tebal
    pitanya tetap semua sumber. Key kategori lama dari tepira ikut diterjemahkan.
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
- **Penyimpanan.** Satu baris `PlaceSpendLimit` per tempat (kunci = nama yang dinormalkan), jadi batas ikut ke
  perangkat lain dan mengubah batas "Kopi" di HP tidak menimpa batas "Bakso" yang baru diatur di laptop. Maksimal 50
  tempat: tempat ke-51 ditolak dengan pesan (dulu yang paling lama dibuang diam-diam).

Semua hari memakai **kalender WIB** (`wibDay` di `lib/game.ts`), sama dengan minggu insight di tepira. Server mengirim
daftar hari yang punya catatan (`activityDays`, 400 hari terakhir) dan tanda nol pengeluaran (`snapshot.sync.noSpend`,
jendela yang sama). Menandai nol pengeluaran hanya untuk hari ini dan 2 hari sebelumnya; membatalkan boleh kapan saja.

## Sinkron antar perangkat

Data desa yang dulu hanya ada di `localStorage` sekarang tersimpan di akun, jadi lampu, perayaan, surat, tur, dan batas
jajan sama di HP dan laptop. Tabelnya milik migrasi tepira (`prisma/schema.prisma` disalin dari sana), semuanya
ber-`userId` NOT NULL (query dengan `{ userId }` biasa, bukan `userOwnedWhere`):

| Data                         | Tabel                                   | Aturan kalau dua perangkat mengubah                                      |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| Tanda nol pengeluaran        | `NoSpendDay` (satu baris per hari WIB, `DATE`) | Tandai = `createMany skipDuplicates` (hari ini..2 hari lalu), batal = `deleteMany`. Hari berbeda tidak saling menimpa |
| Batas jajan per tempat       | `PlaceSpendLimit` (satu baris per tempat) | Per tempat, yang terakhir sampai menang; hapus = hapus sungguhan; maks 50 |
| Surat terakhir dibuka        | `VillageState` kunci `letter`           | Yang terakhir menang                                                     |
| Warga & level yang dirayakan | `VillageState` kunci `seen`             | Maksimum per angka (`GREATEST` di SQL), tidak pernah turun               |
| Progres tur                  | `VillageState` kunci `tour`             | Selesai/dilewati tidak ditimpa "lanjut langkah" dari perangkat lain; ❓ mengulang tur dengan sengaja |
| Kiriman Pak Pos yang sudah diumumkan | `VillageState` kunci `mail` (`{ occ }` = id tagihan tertinggi) | Maksimum (`GREATEST`): tagihan yang diumumkan di HP tidak diumumkan lagi di laptop |

Yang **tetap per perangkat**: preferensi tampilan `tepira-village-ui` (jam/cuaca, label, sembunyikan angka, kunci kamera,
suasana peta, efek musim) karena tergantung layar & tempat, PIN yang sudah dibuka (`sessionStorage`, per tab), dan apakah
perangkat ini mau menerima pengingat (`tepira-village-push:v1:<email>` + langganan push browser-nya; pilihan jenis pengingatnya per
akun, lihat [Pengingat](#pengingat-web-push)).

Cara kerjanya (`lib/village-sync.ts` murni + tes, `lib/village-state.ts` di server, `components/village/daily.ts` di browser):

- **Tanpa kedipan.** Data desa ikut di setiap snapshot (`snapshot.sync`), termasuk render pertama `/village`.
- **Op kecil yang idempoten.** Klik lampu, ubah batas, buka surat, dan langkah tur dikirim sebagai op bernilai mutlak
  (`{ nospend, day, on }`, bukan "toggle") lewat server action `syncVillage`, yang tidak membangun snapshot penuh. Op yang
  terkirim dua kali (respons hilang, dua tab) aman.
- **Outbox.** Op langsung tampil (tampilan = versi server + op yang belum dikonfirmasi, dihitung dengan fungsi yang sama
  dengan server) dan menunggu di `localStorage` (`tepira-village-sync:v2:<email>`) sampai server mengonfirmasi. Offline
  atau gagal: muncul sekali "Belum tersambung…", dicoba lagi 5 dtk → 60 dtk, saat kembali online, dan saat halaman dibuka lagi.
- **Perubahan dari perangkat lain** datang lewat snapshot aksi apa pun (termasuk ganti bulan) dan tarikan saat tab kembali
  dilihat / online (paling sering 30 dtk sekali). Tab lain di browser yang sama ikut lewat event `storage`.
- **Impor sekali per perangkat.** Pertama kali dibuka setelah rilis ini, isi kunci lama (`tepira-village-nospend|seen|letter|
  placelimits|tour:v1:<email>`) dikirim sebagai satu op impor: hari nol digabung (tanpa batas 2 hari, dalam 400 hari),
  batas yang sudah ada di akun menang, surat hanya kalau akun belum punya, perayaan maksimum, tur selesai mengalahkan yang
  aktif. Penandanya `tepira-village-synced:v1:<email>` (sidik jari isi kunci lama). Kunci lama tidak dihapus dulu, supaya
  versi desa sebelumnya masih bisa dipakai kalau rilis dibatalkan.
- **Desa contoh di landing** tidak pernah mengirim apa pun (`snapshot.sync.available = false`, dicek juga di store).

**Jaring urutan rilis.** Kalau desa ter-deploy sebelum migrasi tepira jalan, tabel di atas belum ada: membaca tabel baru
mengembalikan data kosong + `available: false` (`isMissingTable` di `lib/db-missing.ts`: Prisma `P2021`/`P2022`, atau
Postgres `42P01`/`42703` dari SQL mentah), desa jalan dari salinan di browser seperti dulu, dan op menunggu di outbox. Begitu
tabelnya ada, op itu terkirim sendiri. Selama tabelnya belum ada, server tidak menanyakannya lagi selama 60 dtk (log tidak
banjir). Urutan rilis yang benar tetap:

1. Merge PR skema di tepira (`20261014090000_add_village_sync_recurring_push`), lalu `npm run migrate:deploy` di sana dengan
   `DATABASE_URL` produksi.
2. Baru deploy desa.

Untuk server/cron: `hasNoSpendMark(userId, day)` dan `noSpendMarkedUserIds(userIds, day)` di `lib/village-state.ts` menjawab
"hari WIB ini ditandai nol pengeluaran?" (tabel belum ada = `false`). Tanda yang masih di outbox browser (offline) belum terlihat.

## Tagihan rutin & Pak Pos

Langganan, kos, cicilan, iuran, dan nabung rutin cukup diatur sekali. Saat jatuh tempo **Pak Pos** (seragam oranye, topi
biru tua, tas selempang) berjalan dari pantai dekat dermaga ke kotak pos Balai Desa, memasukkan amplop cokelat, lalu menunggu
di depan kotak pos selama masih ada tagihan yang belum dicatat.

| Di desa                         | Isinya                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| 🔁 Tagihan & setoran rutin      | Daftar + form: nama, nominal, kategori, dompet, sumber (pengeluaran) atau goal (setoran), ulangi tiap minggu / 2 minggu / bulan / 3 bulan / 6 bulan / tahun, jatuh tempo pertama, "selalu akhir bulan", berapa kali (cicilan) + yang sudah dibayar, ⚡ otomatis, 📍 tempat. ✏️ Ubah, ⏸️ Jeda / ▶️ Lanjutkan, 🗑 Hapus |
| 📮 Kotak pos (klik kotak pos / Pak Pos / chip 📮 di kartu kiri atas) | 🧾 Tagihan: Catat (nominal & dompet bisa diubah), Lewati (dengan konfirmasi), Catat semua, Lewati yang lama · 🔁 Tercatat otomatis 7 hari · 📅 Segera (≤3 hari) · surat Cyrene |
| Pintu lain                      | Chip 🔁 di atas form Catat, "🔁 Jadikan rutin" di Riwayat (tanggal catatan jadi patokan), 🔁 Setoran rutin di detail goal & 🔁 Rutinkan di Nabung, 🔁 Rutin bulan ini di panel Bulan ini |
| Riwayat                         | Catatan dari tagihan diberi 🔁 (🔁⚡ = otomatis). Menghapusnya mengembalikan saldo; tagihan periode itu tidak diantar lagi |

Aturannya (`lib/recurring.ts`, murni + tes):

- **Tanggal = kalender WIB.** Kolom `DATE` ditulis `wibDayDate(hari)`, dibaca `wibDay(date)`; pengeluaran/setoran bertanggal hari
  jatuh temponya. Tgl 29–31 dijepit ke akhir bulan tiap kali, patokannya tetap: 31 Jan → 28 Feb → 31 Mar. Tahunan 29 Feb → 28 Feb
  di tahun biasa. "Bulan ini" bawaan juga bulan WIB (`normalizePeriod`), jadi sewa tgl 1 yang tercatat 00:00–07:00 WIB terlihat.
- **Tanpa tagihan mundur.** Jatuh tempo pertama ≥ hari ini; dilanjutkan dari jeda → periode selama dijeda tidak ditagih.
- **Tagihan dibuat dulu, lalu diselesaikan.** Jatuh tempo ≤ hari ini menjadi baris `RecurringOccurrence` "pending" (maks 12 per
  aturan per putaran, sisanya menyusul). Nominalnya disalin saat itu: mengubah aturan hanya berlaku untuk tagihan berikutnya.
- **⚡ Otomatis** mencatat sendiri tagihan yang umurnya **≤ 35 hari** dan tidak terhalang. Yang lebih tua ("lama tidak dibuka, cek
  dulu"), yang dompetnya sudah dihapus, dan setoran ke goal yang sudah tercapai tetap menunggu di kotak pos (dompet pengganti bisa
  dipilih dan diingat; goal tercapai: Tetap setor / Lewati / Jeda). Menyalakan ⚡ juga berlaku untuk tagihan yang sedang menunggu
  (≤35 hari); mematikannya langsung berhenti.
- **Cicilan:** "berapa kali" + "sudah dibayar sebelumnya" → "cicilan 4/12"; tagihan terakhir dibuat → selesai. Lewati tetap
  menghabiskan satu periode.
- **Ubah jadwal** menghitung ulang dari max(pilihan, hari ini, tagihan terakhir + 1): satu tanggal tidak pernah ditagih dua kali.
- **Hapus aturan** = tagihan yang menunggu ikut hilang; pengeluaran/setoran yang sudah tercatat tetap ada.
- **Pengeluaran** dipotong dari dompet dengan aturan tepira (`createExpenseInTx`: aset berkurang, utang bertambah, `increment`
  atomik). **Setoran** hanya membuat Contribution (tidak menyentuh dompet), sama seperti Nabung.

Kapan diproses: render `/village` (sebelum `buildSnapshot`, jadi saldo di render pertama sudah terpotong), `fetchSnapshot` (refresh
& ganti bulan), aksi 🔁, aksi ringan `syncRecurring` saat hari WIB berganti selagi desa terbuka atau tab kembali dilihat setelah
>30 menit (snapshot hanya dibangun kalau ada yang berubah), dan dua cron harian untuk semua user (`/api/cron/postman` 07.00–08.00 WIB
dan susulan `/api/cron/reminders` 20.00–21.00 WIB, lihat [Pengingat](#pengingat-web-push)). Semua aman dijalankan bersamaan
(dua tab, HP + laptop, cron): membuat tagihan = compare-and-set `nextDueDate` (+ `updatedAt`) lalu `createMany skipDuplicates`
(unik `recurringId + dueDate`); menyelesaikan = klaim `pending → posted/skipped` (dengan `userId`), pengeluaran/setoran, dan
tautannya dalam satu transaksi pendek per tagihan (hanya `tx`, tanpa `Promise.all`, `connection_limit=1`). Yang kalah balapan
mendapat "sudah dicatat di perangkat lain", bukan error. Hasil `syncRecurring` di belakang layar dibuang kalau sementara itu ada
aksi lain atau bulan sudah berganti.

**Pengumuman.** Kiriman baru (tagihan / catatan otomatis ber-id di atas penanda `mail` di akun) diumumkan sekali: "🔁 Spotify sudah
dicatat otomatis. 📮 Pak Pos mengantar 2 tagihan." Tanpa animasi kalau sistem minta *kurangi gerakan*, tur sedang jalan, atau layar
penuh terbuka.

**Privasi.** Pesan, label dunia (kotak pos: "🧾 2 tagihan"), dan chip HUD hanya berisi jumlah / nama tagihan, tidak pernah nominal;
nominal di panel lewat `<Money/>` / `AmountInput` dan toast `-Rp…` di kotak pos ikut mode sembunyikan angka.

**Tabel & urutan rilis.** `RecurringTransaction` dan `RecurringOccurrence` milik migrasi tepira yang sama dengan tabel sinkron
(`20261014090000_add_village_sync_recurring_push`): migrasi dulu, baru deploy desa. Kalau desa jalan duluan, jaring urutan rilis
yang sama berlaku: snapshot memakai `recurring.available: false` (tanpa Pak Pos, tanpa pintu 🔁), `processDueRecurring` tidak
berbuat apa-apa, tulis = pesan ramah, dan tabelnya tidak ditanya lagi selama 60 dtk. Relasi ke tabel baru sengaja tidak di-include di
query pengeluaran/setoran (tanda 🔁 & penyaring lampu dibaca terpisah), jadi query lama tetap jalan.

Untuk cron (`lib/recurring-server.ts`): `processDueRecurring({ userId?, now?, budgetMs? })` (tanpa `userId` = semua user, per batch,
berhenti memulai pekerjaan baru setelah `budgetMs`, default 40 dtk), `pendingBillCounts({ userIds?, now? })` (tagihan menunggu &
yang jatuh tempo hari ini per user), dan `userIdsRecordedOn(userIds, day)` (hari itu "tercatat" tanpa menghitung yang otomatis,
baris lama tanpa pemilik menyalakan semua user seperti lampu di desa; digabung dengan `noSpendMarkedUserIds` oleh pengingat lampu).

## Pengingat (web push)

Notifikasi singkat di HP/laptop, juga saat desa tidak dibuka. Dinyalakan per perangkat di **🏝️ Perkembangan desa → 🔔 Pengingat**
(di bawah lampu streak).

| Pengingat                          | Kapan (WIB)                                    | Isi                                                                     | Diklik            |
| ---------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- | ----------------- |
| 📬 Tukang pos                      | 07.00–08.00, susulan 20.00–21.00 kalau pagi belum terkirim | "📬 Tukang pos membawa 2 tagihan" + "Jatuh tempo hari ini / sudah lewat"; atau "sudah mampir: 1 kiriman rutin dicatat otomatis" | 📮 Kotak pos |
| 💡 Lampu                            | 20.00–21.00                                    | "💡 Lampu hari ini belum menyala": hari ini belum ada catatan & belum ditandai nol | 🏝️ Perkembangan desa |
| Keduanya di putaran malam          | 20.00–21.00                                    | Satu notifikasi: lampu + "Tukang pos juga membawa N tagihan"             | 📮 Kotak pos      |

- **Tanpa nominal, tanpa nama tagihan.** Hanya jumlah, jadi aman di layar kunci. Kalau `APP_PIN` aktif isinya umum sama sekali
  ("🏝️ tepira village · Ada pengingat dari desamu"), karena layar kunci tidak dilindungi PIN desa.
- **Lampu = lampu di desa.** "Tercatat" = pengeluaran/setoran bertanggal hari ini (termasuk baris lama tanpa pemilik, seperti
  `userOwnedWhere`), tanpa yang dicatat **otomatis** oleh Pak Pos, atau tanda nol pengeluaran (`NoSpendDay`). Tanda yang masih di
  outbox browser (offline) belum terlihat oleh cron.
- **Tagihan** dikabarkan kalau ada tagihan menunggu yang jatuh temponya ≤ 3 hari lalu (`BILL_NAG_DAYS`), atau ada yang dicatat
  otomatis hari ini. Angkanya = semua tagihan yang menunggu (sama dengan chip 📮). Tagihan yang lebih lama tetap ditunggui Pak Pos,
  tapi HP tidak ditagih tiap pagi selamanya.
- **Paling banyak sekali per jenis per hari.** Satu baris `ReminderPreference` per akun (`lampSentOn`, `billSentOn` = hari WIB,
  `DATE`) diklaim dengan `updateManyAndReturn` bersyarat **sebelum** mengirim, jadi cron yang terpanggil dua kali / bersamaan tidak
  mengirim dobel. Kalau tidak satu pun perangkat user menerima karena gangguan sementara (jaringan, 429, 5xx, waktu habis),
  klaimnya dikembalikan dan putaran berikutnya mencoba lagi.
- **Pilihan** 💡 lampu / 📬 tagihan per **akun** (berlaku di semua perangkat); **perangkat ini** dinyalakan / dimatikan sendiri.
  Tombol *Kirim tes* mengirim satu notifikasi ke perangkat ini saja (paling sering sekali per 15 dtk). Daftar *Perangkat penerima*
  (dari user-agent) bisa dihapus satu per satu, mis. HP lama. Maksimal 10 perangkat per akun.
- **Keluar akun** menghapus langganan perangkat ini (maks 2 dtk, keluar tidak pernah tertahan). Browser bersama yang berganti akun:
  menyalakan pengingat memindahkan langganan browser itu ke akun yang menyalakan (upsert per `endpoint`).
- **iPhone/iPad (iOS 16.4+)**: push hanya untuk web app di Layar Utama. Di tab Safari biasa bagian ini menampilkan langkah *Bagikan →
  Tambahkan ke Layar Utama*; app di Layar Utama punya cookie sendiri, jadi login sekali lagi di sana. (Login Google di dalam app Layar
  Utama belum dites di iPhone sungguhan.)
- Izin diblokir → petunjuk membuka pengaturan situs (browser tidak mau bertanya lagi). Brave/Chromium tanpa layanan Google →
  pesan "layanan push browser ini mati". Server tanpa kunci VAPID → "Pengingat belum diatur di server ini", desa tetap jalan.

Cara kerjanya:

- **Browser.** `public/sw.js` (scope `/`, `Cache-Control: no-store` lewat `next.config.mjs`) hanya menangani `push` (selalu
  menampilkan notifikasi; data rusak → teks bawaan) dan `notificationclick` (hanya URL `/village…`; tab desa yang terbuka
  difokuskan dan membuka panelnya lewat `postMessage`, kalau tidak ada dibuka `/village?buka=desa|pos`). Tanpa handler `fetch`: tidak
  ada cache/offline. `components/village/push.ts` memegang izin & langganan (izin hanya diminta dari klik, `Notification` tidak pernah
  diakses tanpa pengecekan); `usePushBridge` di `VillageApp` membuka panel dari klik notifikasi, membuang `?buka=` dari URL, dan
  setiap desa dibuka **memperbaiki langganan** perangkat yang mau dikabari (`tepira-village-push:v1:<email>` di localStorage, sengaja
  tidak ikut sinkron): langganan dibuat ulang kalau dicabut browser / kunci VAPID diganti, disimpan lagi kalau baris di server sudah
  dihapus; izin dicabut → baris di server ikut dihapus.
- **Server action** (`app/village/push-actions.ts`, tanpa snapshot): `getReminderStatus`, `savePushSubscription` (endpoint harus
  `https:` ke layanan push yang dikenal: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`,
  `web.push.apple.com` / `*.push.apple.com`, supaya cron tidak bisa disuruh POST ke alamat sembarang), `removePushSubscription`,
  `forgetPushDevice`, `updateReminderPrefs`, `sendTestPush`. Endpoint (izin mengirim push) tidak pernah dikirim ke browser lain dan
  tidak pernah masuk log (hanya host-nya).
- **Cron** (`vercel.json`, Vercel Hobby: sekali sehari per jadwal, jam UTC, bisa telat sampai 59 menit, bisa terpanggil dua kali):
  `0 0 * * *` → `/api/cron/postman`, `0 13 * * *` → `/api/cron/reminders`. Keduanya menjalankan Pak Pos untuk semua user dulu
  (`processDueRecurring`, maks 30 dtk), lalu membaca langganan, pilihan, tagihan, dan catatan hari ini per batch (`IN …`, tanpa query
  per user), mengklaim, lalu mengirim (maks 8 sekaligus, satu notifikasi per perangkat, `TTL` sampai tengah malam WIB / maks 12 jam
  untuk tagihan, `topic` = jenis + hari). Runtime Node, `maxDuration = 60`. Hasil kirim: 404/410/401/403 → langganan dihapus
  (perangkatnya berlangganan ulang sendiri saat desa dibuka); gagal lain → `failureCount` naik, dihapus di kegagalan ke-5; berhasil →
  `failureCount` 0 + `lastSuccessAt`. Kunci VAPID dicek berpasangan sebelum dipakai, jadi kunci yang tertukar tidak menghapus semua
  langganan.
- **Auth cron** hanya `Authorization: Bearer $CRON_SECRET` (dibandingkan waktu-konstan). `CRON_SECRET` kosong = semua ditolak (401);
  user-agent `vercel-cron` saja tidak cukup. Jawabannya hanya hitungan (tanpa data pribadi). `?dryRun=1` = tanpa Pak Pos, tanpa klaim,
  tanpa kirim, hanya rencana.
- **Logika murni + tes**: `lib/reminders.ts` (siapa dapat apa, teks, TTL/topic, klasifikasi status, pengiriman paralel),
  `lib/push-subscription.ts` (validasi langganan, label perangkat), `lib/cron-auth.ts`; `lib/push-send.ts` (VAPID & web-push, dites
  dengan web-push tiruan).

**Tabel & urutan rilis.** `WebPushSubscription` (satu baris per browser, `endpoint` unik) dan `ReminderPreference` (satu baris per
user) ikut migrasi tepira yang sama (`20261014090000_add_village_sync_recurring_push`). Kalau desa jalan duluan: bagian 🔔 bilang
"belum siap di server", tulis = pesan ramah, cron tetap 200 dengan `push.available: false`, desa tidak terganggu.

**Menyiapkan.**

1. Buat kunci VAPID di terminalmu sendiri: `npx web-push generate-vapid-keys`. Pakai pasangan berbeda untuk lokal dan produksi.
2. Di project Vercel `tepira-village` (Production) isi `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Sensitive), `VAPID_SUBJECT`
   (`mailto:…` atau `https://domain-desa`, bukan localhost), dan `CRON_SECRET` (mis. `openssl rand -hex 32`, Sensitive) **sebelum**
   deploy: kunci publik ikut di-build ke browser. Mengganti kunci = deploy ulang; perangkat berlangganan ulang sendiri saat desa dibuka.
3. Setelah deploy, cek Settings → Cron Jobs (dua jadwal), nyalakan pengingat di HP, lalu *Kirim tes*.
4. Dari terminalmu: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<domain>/api/cron/reminders?dryRun=1"`.

Lokal: tanpa kunci VAPID bagiannya hanya bilang belum diatur. Dengan kunci lokal di `.env.local`, Chrome/Edge di `http://localhost`
menerima push sungguhan. `PUSH_SEND_MODE=log` = tidak mengirim, hanya `[push:log] <host> <tag> <judul>` di log server. Cron lokal:
`curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/reminders?dryRun=1"`. Push tanpa server bisa dicoba
dari DevTools → Application → Service Workers → Push, mis. `{"title":"Tes","body":"Halo","tag":"t","url":"/village?buka=pos"}`.

## Arsitektur

```
app/
  page.tsx                landing (hero desa contoh 3D) → redirect ke /village jika sudah login
  landing.css             gaya landing & login, di-scope ke .lp (body tetap overflow:hidden untuk /village)
  login/page.tsx          login Google (Auth.js v5), opsional dev-login
  village/page.tsx        server component: auth + buildSnapshot → <VillageApp/>
  village/actions.ts      server actions: nabung, catat pengeluaran, goal (+ target tanggal), dompet, alokasi gaji (semua balikin snapshot baru);
                          syncVillage (op data desa, balikin snapshot.sync saja); tagihan rutin (buat/ubah/jeda/hapus, Catat/Lewati,
                          syncRecurring ringan); page.tsx & fetchSnapshot memproses jatuh tempo dulu
  village/push-actions.ts server actions 🔔 pengingat (status, simpan/hapus langganan, pilihan, kirim tes), tanpa snapshot
  api/auth/[...nextauth]  handler Auth.js
  api/cron/postman        cron 07:xx WIB: Pak Pos semua user + push tagihan (Bearer CRON_SECRET)
  api/cron/reminders      cron 20:xx WIB: susulan Pak Pos + push lampu belum menyala & tagihan yang belum dikabarkan
lib/
  snapshot.ts             satu query gabungan + rumus skor kesehatan (disalin dari tepira/lib/report-scoring.ts)
  wallet-expenses.ts      port dari tepira (aturan potong/kembalikan saldo dompet, increment atomik); createExpenseInTx untuk tagihan
  game.ts                 tipe Snapshot, level/XP, tahap bangunan, hari WIB, streak & warga, bangunan level, kejar deadline
  quick-entry.ts          pengurai "catat cepat": kalimat → nominal, kategori, dompet, tanggal, tempat, catatan
  spoken-amount.ts        🎤 bilangan yang diucapkan → angka ("lima belas ribu" → "Rp15.000") sebelum quick-entry
  flow.ts                 aliran uang: gaji/bonus → waduk → kategori, goal, disisihkan, belum terpakai + tata letak pita SVG
  season.ts               musim per bulan, hari ke-N tahun (WIB), pergantian musim berikutnya, kalender kebiasaan, mixHex
  places.ts               peta jajan: pencocokan tempat, pengelompokan per tempat, warna & ikon kategori, ringkasan
                          sidebar (langganan, pertama kali, tanpa tempat), penggabungan penanda berdekatan,
                          belanja per nama tempat (spendByPlaceName)
  place-limits.ts         batas jajan per tempat: parse/simpan, status aman/hampir/lewat
  kiosks.ts               pemilihan kios tempat langganan, slot stabil (hash), keramaian
  village-sync.ts         data desa per user (murni): bentuk data, op idempoten + aturan gabung, outbox ringkas, impor kunci v1
  village-state.ts        (server) baca/tulis NoSpendDay, PlaceSpendLimit, VillageState; hasNoSpendMark untuk cron
  db-missing.ts           jaring urutan rilis: isMissingTable, readOrMissing, pesan ramah kalau tabel baru belum ada
  recurring.ts            tagihan rutin (murni): jadwal WIB (dijepit akhir bulan), otomatis vs tagihan, terhalang, label, validasi
  recurring-server.ts     (server) baca untuk snapshot, buat & selesaikan tagihan (aman bersamaan), aksi user, fungsi untuk cron
  reminders.ts            pengingat (murni): siapa dapat apa, teks notifikasi tanpa nominal, TTL/topic, status kirim, kirim paralel
  push-subscription.ts    validasi langganan push dari browser (host layanan push yang dikenal), label perangkat
  push-send.ts            (server) kunci VAPID (dicek berpasangan), pengirim web-push & mode log
  push-server.ts          (server) WebPushSubscription & ReminderPreference: status, simpan (pindah akun), hapus, pilihan, tes
  reminder-cron.ts        (server) putaran cron: Pak Pos, rencana, klaim per hari, kirim, bereskan langganan mati
  cron-auth.ts            Bearer CRON_SECRET waktu-konstan, gagal tertutup
  *.test.ts               tes Node (node:test lewat tsx): `npm test`
  demo-snapshot.ts        desa contoh fiktif untuk landing (tidak pernah dikirim ke server)
  auth.ts, prisma.ts      sama polanya dengan tepira (JWT session, userOwnedWhere, connection_limit=1)
components/village/
  store.ts                zustand: snapshot dari server, data desa (base + outbox → tampilan), preferensi visual (localStorage)
  daily.ts                salinan data desa di browser: outbox op yang belum terkirim, versi server terakhir (untuk tab
                          lain), impor sekali dari kunci v1; letterKey surat mingguan
  kiosks.ts, usePlaces.ts kios yang berdiri untuk snapshot ini; hook belanja per tempat, status batas, kios
  geo.ts                  lokasi sekarang (browser) + nama/pencarian tempat (Nominatim)
  speech.ts               🎤 Web Speech (SpeechRecognition id-ID): dukungan browser, hook mendengar, pesan galat
  push.ts, usePush.ts     🔔 izin & langganan push di browser; klik notifikasi → panel, perbaikan langganan saat desa dibuka
  seasons.ts              tampilan pulau per musim (warna rumput/daun, kolam, buah), pojok musim, useReducedMotion
  useProgress.ts          hook: hari WIB (ganti tengah malam), streak, level/XP, surat minggu ini, tagihan di kotak pos (useBills, useMail)
  layout.ts               posisi kavling, peti dompet, warung, balai desa, jalur setapak, lampu, bangunan level, preset cuaca
  scene/                  react-three-fiber: Island, Decor, GoalBuilding, WalletChest, Warung, Hall, Villager,
                          StreetLamps, Townsfolk (warga), Unlocks (bangunan level), Mailbox, Postman (Pak Pos), Kiosks (kios langganan),
                          Seasons (hujan, pelangi, kunang-kunang, layangan, daun, kupu-kupu, bendera, pojok musim)
  scene/labels.ts         label DOM yang diproyeksikan tiap frame (pengganti drei <Html>, aman di React 19)
  map/                    peta jajan: gameStyle (gaya peta desa siang/senja/malam), JajanMap (MapLibre + penanda)
  ui/                     HUD, Panels (Goal / Nabung / Catat / Dompet / Gaji / Riwayat / Bulan ini / Perkembangan desa /
                          Surat), JajanView (peta jajan layar penuh), PlaceLimit (editor & petunjuk batas jajan),
                          SalaryPanel, PlacePicker, PinGate, Tutorial, AliranView (aliran uang layar penuh),
                          VoiceButton (🎤 catat cepat), JournalPanel (📔 jurnal tahun ini), RecurringPanel (🔁 tagihan rutin + tagihan
                          di 📮 kotak pos), ReminderSection (🔔 pengingat di Perkembangan desa)
  tutorial/               langkah tur pengguna baru; baseline & hitungan aksi per tab (status tur tersimpan di akun)
components/landing/       Brand, HeroVisual (poster → 3D saat idle), DemoIsland (potongan scene, kamera berputar, tanpa input)
components/brand/Logo.tsx LogoMark "Pulau Koin" (inline SVG; versi kecil <= 48 px, versi lengkap di atasnya)
public/brand/             mark.svg, mark-small.svg (= favicon.svg), app-icon.svg (sumber apple-touch-icon & icon-192/512)
public/sw.js              service worker HANYA untuk web push (push + klik notifikasi), tanpa cache
vercel.json               dua cron harian (Hobby): postman 0 0 * * * dan reminders 0 13 * * * (UTC)
prisma/schema.prisma      SALINAN skema tepira — repo ini tidak punya migrasi sendiri
```

Alur data: halaman `/village` dirender di server dengan snapshot awal → client menyimpan di zustand → setiap aksi
memanggil server action yang menulis ke DB **dengan aturan yang sama persis dengan tepira** lalu mengembalikan
snapshot terbaru, sehingga desa langsung ter-update dalam satu round-trip. Data desa (lampu nol, batas jajan, surat,
perayaan, tur) lewat jalur ringan: tampil seketika dari outbox, lalu `syncVillage` di belakang layar. Tagihan rutin yang
jatuh tempo diproses di server sebelum snapshot dibangun (render halaman, ganti bulan, aksi 🔁).

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
| `APP_PIN` (opsional)         | Sama seperti tepira: angka disembunyikan sampai PIN dimasukkan. Notifikasi pengingat jadi umum (tanpa jumlah). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (opsional) | Kunci publik VAPID untuk 🔔 pengingat. Di-build ke browser: harus ada **sebelum** deploy, mengganti = deploy ulang. |
| `VAPID_PRIVATE_KEY` (opsional) | Pasangan kunci privatnya (Sensitive). Dicek berpasangan; tidak cocok = pengingat dianggap belum diatur. |
| `VAPID_SUBJECT` (opsional)   | `mailto:<kontak>` atau `https://<domain desa>`, bukan localhost.                            |
| `CRON_SECRET`                | Rahasia cron (`/api/cron/postman`, `/api/cron/reminders`), acak & panjang (`openssl rand -hex 32`), Sensitive. Kosong = cron selalu 401, jadi Pak Pos & pengingat tidak jalan dari cron. Terpisah dari milik tepira. |
| `PUSH_SEND_MODE` (dev/tes)   | `log` = notifikasi tidak dikirim, hanya dicatat (host + tag + judul) di log server.         |
| `DEV_LOGIN_EMAIL` (dev saja) | Login tanpa Google di `npm run dev`. Diabaikan total saat `NODE_ENV=production`.           |

### Development lokal tanpa Supabase

```bash
createdb tepira_village_dev
# .env → DATABASE_URL="postgresql://localhost:5432/tepira_village_dev", DEV_LOGIN_EMAIL="dev@tepira.local"
npm run db:push:dev      # membuat tabel dari salinan skema (HANYA untuk DB lokal)
npm run seed:dev         # data contoh: 4 goal (1 telat jadwal, 1 lebih cepat), 4 dompet, alokasi gaji,
                         # pengeluaran hampir tiap hari (streak + 3 warga), 1 insight mingguan, 4 tagihan/setoran rutin
                         # (tagihan rutin juga ditambahkan ke user yang datanya sudah ada, sekali saja)
npm run dev              # /login → tombol "Dev login (tanpa Google)"
```

Jangan pernah menjalankan `db:push:dev` ke database produksi; skema & migrasi dimiliki repo tepira. Lupa `db:push:dev`
setelah menyalin skema baru? Desa tetap jalan dalam mode lokal (data desa hanya di browser, tanpa Pak Pos, 🔔 pengingat "belum siap",
peringatan `[desa] tabel … belum ada` di log server) sampai tabelnya dibuat.

### Build & deploy

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Deploy ke Vercel seperti tepira. `postinstall` menjalankan `prisma generate`. `vercel.json` mendaftarkan dua cron harian (hanya
jalan di deployment Production); isi `CRON_SECRET` dan kunci VAPID dulu, lihat [Pengingat](#pengingat-web-push).

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

- Progres (`{ status, step }`) tersimpan di akun (`VillageState` kunci `tour`). Tur yang belum selesai dilanjutkan saat
  reload atau di perangkat lain; tur yang sudah selesai/dilewati di HP tidak muncul lagi di laptop (dan tur yang sedang
  jalan di tab lain ikut ditutup). User lama tidak pernah dimulai otomatis.
- Tombol ❓ di kartu kiri atas mengulang tur kapan saja. `Esc` menutup tur (kecuali saat mengetik di kolom isian),
  `Enter`/`→` = Lanjut di langkah info.
- Kalau `APP_PIN` aktif, tur baru muncul setelah PIN dibuka.

## Kontrol

- Drag untuk memutar, scroll/pinch untuk zoom, klik kanan/⇧+drag untuk geser. 🎯 Reset view mengembalikan sudut awal.
- Klik bangunan goal → detail goal. Klik peti → dompet. Klik warung → catat pengeluaran. Klik balai desa / si penabung → ringkasan bulan.
- Klik lampu, warga, bangunan level, atau baris 🔥 di kartu kiri atas → perkembangan desa. Klik kotak pos, Pak Pos, atau chip
  📮 di kartu kiri atas → 📮 kotak pos (tagihan rutin + surat mingguan).
- Klik kolam, atau kotak Pengeluaran / Sisa budget di kartu kiri atas → 🌊 aliran uang.
- Klik notifikasi pengingat → desa terbuka (atau tab desa yang sudah terbuka difokuskan) langsung di 📮 kotak pos / 🏝️ perkembangan desa.
- ‹ › di atas untuk berpindah bulan (URL ikut berubah: `?month=&year=`); musim pulau ikut. Klik label bulan → 📔 jurnal.
- 👁️ / 🙈 untuk menyembunyikan angka (mode privasi), 🪄 cuaca otomatis mengikuti skor kesehatan.
