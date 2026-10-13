import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickEntry, type QuickWallet } from "./quick-entry";

const WALLETS: QuickWallet[] = [
  { id: 1, name: "BCA", type: "bank" },
  { id: 2, name: "GoPay", type: "e-wallet" },
  { id: 3, name: "Dompet tunai", type: "cash" },
  { id: 4, name: "Kartu kredit", type: "credit" }
];
// Senin 12 Oktober 2026, siang
const TODAY = new Date(2026, 9, 12, 14, 0);
const parse = (text: string, wallets: QuickWallet[] = WALLETS) => parseQuickEntry(text, wallets, TODAY);

test("contoh utama: nominal, kategori, dompet, catatan", () => {
  assert.deepEqual(parse("bakso 15rb gopay"), {
    amount: 15_000,
    assumedThousands: false,
    categoryKey: "makan_harian",
    walletId: 2,
    daysAgo: null,
    source: null,
    place: null,
    note: "Bakso"
  });
});

test("tanggal: kemarin, kemarin lusa, N hari lalu, tadi", () => {
  const k = parse("kemarin parkir 2rb");
  assert.equal(k.daysAgo, 1);
  assert.equal(k.amount, 2_000);
  assert.equal(k.categoryKey, "transport");
  assert.equal(k.note, "Parkir");
  assert.equal(parse("kemarin lusa obat 45rb").daysAgo, 2);
  assert.equal(parse("kemarin lusa obat 45rb").categoryKey, "kesehatan");
  assert.equal(parse("3 hari lalu ojek 18rb").daysAgo, 3);
  assert.equal(parse("ojek 18rb 3 hari yang lalu").daysAgo, 3);
  assert.equal(parse("tadi siang makan 30rb").daysAgo, 0);
  assert.equal(parse("tadi siang makan 30rb").note, "Makan");
  assert.equal(parse("semalam martabak 40rb").daysAgo, 1);
  assert.equal(parse("bakso 15rb").daysAgo, null);
});

test("tanggal: tgl N = bulan ini kalau sudah lewat, kalau belum bulan lalu", () => {
  assert.equal(parse("tgl 10 pulsa 50rb").daysAgo, 2);
  assert.equal(parse("tgl 12 pulsa 50rb").daysAgo, 0);
  // 20 September → 22 hari sebelum 12 Oktober
  assert.equal(parse("tanggal 20 kos 1.800.000").daysAgo, 22);
  assert.equal(parse("tanggal 20 kos 1.800.000").amount, 1_800_000);
  // 31 September tidak ada
  assert.equal(parse("tgl 31 kos 1jt").daysAgo, null);
});

test("format nominal", () => {
  assert.equal(parse("kopi 25k").amount, 25_000);
  assert.equal(parse("makan 35 ribu").amount, 35_000);
  assert.equal(parse("laptop 1,5jt").amount, 1_500_000);
  assert.equal(parse("laptop 1.5 juta").amount, 1_500_000);
  assert.equal(parse("spotify 54.900").amount, 54_900);
  assert.equal(parse("spotify 54,900").amount, 54_900);
  assert.equal(parse("sewa 1.250.000").amount, 1_250_000);
  assert.equal(parse("Rp15.000 sabun").amount, 15_000);
  assert.equal(parse("rp. 15.000 sabun").amount, 15_000);
  assert.equal(parse("parkir 500 perak").amount, 500);
  assert.equal(parse("sabun 15000").amount, 15_000);
  assert.equal(parse("bakso").amount, null);
});

test("angka kecil tanpa satuan dibaca ribuan", () => {
  const p = parse("bakso 15");
  assert.equal(p.amount, 15_000);
  assert.equal(p.assumedThousands, true);
  assert.equal(parse("bakso 15rb").assumedThousands, false);
  assert.equal(parse("sabun 15000").assumedThousands, false);
});

test("memilih nominal yang benar di antara angka lain", () => {
  assert.equal(parse("nasi padang 2 porsi 30rb").amount, 30_000);
  assert.equal(parse("nasi padang 2 porsi 30rb").note, "Nasi padang 2 porsi");
  assert.equal(parse("beli 3 roti 15000").amount, 15_000);
  assert.equal(parse("2x bakso 15rb").amount, 15_000);
  // angka yang menempel ke huruf bukan nominal
  assert.equal(parse("im3 50rb").amount, 50_000);
  assert.equal(parse("im3 50rb").categoryKey, "pulsa_internet");
});

test("dompet: nama, sebutan jenis, kata penghubung", () => {
  assert.equal(parse("spotify 54.900 kartu kredit").walletId, 4);
  assert.equal(parse("spotify 54.900 kartu kredit").note, "Spotify");
  assert.equal(parse("kopi 25k pakai tunai").walletId, 3);
  assert.equal(parse("kopi 25k pakai tunai").note, "Kopi");
  assert.equal(parse("token listrik 100rb via bca").walletId, 1);
  assert.equal(parse("kopi 20rb cash").walletId, 3);
  assert.equal(parse("netflix 65rb kk").walletId, 4);
  assert.equal(parse("transfer ortu 500rb").walletId, 1);
  assert.equal(parse("bakso 15rb").walletId, null);
});

test("dompet: alias terpanjang menang, tanpa dompet jenis itu tidak ditebak", () => {
  const wallets: QuickWallet[] = [
    { id: 10, name: "BCA", type: "bank" },
    { id: 11, name: "Kartu kredit BCA", type: "credit" }
  ];
  assert.equal(parse("makan 50rb kartu kredit bca", wallets).walletId, 11);
  assert.equal(parse("makan 50rb bca", wallets).walletId, 10);
  // urutan dompet terbalik: nama lengkap "BCA" tetap menang atas kata "bca" di nama kartu kredit
  assert.equal(parse("makan 50rb bca", [...wallets].reverse()).walletId, 10);
  // tidak ada dompet tunai: "tunai" tetap jadi catatan
  const p = parse("bakso 15rb tunai", wallets);
  assert.equal(p.walletId, null);
  assert.equal(p.note, "Bakso tunai");
});

test("kategori: frasa panjang menang atas kata pendek", () => {
  assert.equal(parse("pasta gigi 12rb").categoryKey, "belanja_kecil");
  assert.equal(parse("dokter gigi 150rb").categoryKey, "kesehatan");
  assert.equal(parse("es teh 5rb").categoryKey, "nongkrong");
  assert.equal(parse("air mineral 4rb").categoryKey, "makan_harian");
  assert.equal(parse("token listrik 100rb").categoryKey, "listrik_kos");
  assert.equal(parse("gofood 45rb gopay").categoryKey, "makan_harian");
  assert.equal(parse("grab 25rb").categoryKey, "transport");
  assert.equal(parse("ibu kos 1jt").categoryKey, "listrik_kos");
  assert.equal(parse("belanja sayur 40rb").categoryKey, "makan_harian");
  assert.equal(parse("indomaret 30rb").categoryKey, "belanja_kecil");
  assert.equal(parse("xyz 10rb").categoryKey, null);
});

test("sumber bonus dan pembersihan catatan", () => {
  const p = parse("kado dari bonus 200rb");
  assert.equal(p.source, "bonus");
  assert.equal(p.categoryKey, "sosial");
  assert.equal(p.note, "Kado");
  assert.equal(parse("bonus 200rb").source, null);
  assert.equal(parse("beli pulsa 50rb").note, "Pulsa");
  assert.equal(parse("  bayar   parkir ,  2rb ").note, "Parkir");
});

test("kalimat kosong", () => {
  assert.deepEqual(parse("   "), {
    amount: null,
    assumedThousands: false,
    categoryKey: null,
    walletId: null,
    daysAgo: null,
    source: null,
    place: null,
    note: ""
  });
});

const PLACES = [
  { name: "Bakso Pak Kumis", lat: -6.8935, lng: 107.6104, count: 5 },
  { name: "Indomaret Dago", lat: -6.8858, lng: 107.6136, count: 3 }
];
const parseAt = (text: string) => parseQuickEntry(text, WALLETS, TODAY, PLACES);

test("tempat: @nama, nominal & dompet sesudahnya tidak ikut jadi nama", () => {
  const p = parseAt("bakso @warung bu imas 15rb gopay");
  assert.deepEqual(p.place, { name: "Warung Bu Imas", lat: null, lng: null });
  assert.equal(p.amount, 15_000);
  assert.equal(p.walletId, 2);
  assert.equal(p.note, "Bakso");
  assert.equal(parseAt("makan 20rb @warung, enak").place?.name, "Warung");
  assert.equal(parseAt("makan 20rb @").place, null);
});

test("tempat: cocok dengan tempat yang pernah dicatat (titiknya ikut)", () => {
  assert.deepEqual(parseAt("makan 25rb @bakso pak kumis").place, { name: "Bakso Pak Kumis", lat: -6.8935, lng: 107.6104 });
  // sebagian nama cukup
  assert.equal(parseAt("makan 25rb @kumis").place?.lat, -6.8935);
});

test("tempat: huruf seperti diketik, kategori dari nama tempat kalau catatannya diam", () => {
  assert.equal(parseAt("50rb @KFC").place?.name, "KFC");
  assert.equal(parseAt("30rb @indomaret").categoryKey, "belanja_kecil");
  assert.equal(parseAt("30rb @indomaret").place?.name, "Indomaret Dago");
  // angka tanpa satuan di nama tempat bukan nominal
  assert.equal(parseAt("roti 15000 @indomaret 24 jam").amount, 15_000);
});

test("suara: rupiah = nominal jelas, rebu, dan kalimat hasil normalizer", () => {
  const p = parse("parkir 500 rupiah");
  assert.equal(p.amount, 500);
  assert.equal(p.assumedThousands, false);
  assert.equal(p.note, "Parkir");
  assert.equal(parse("bakso 15.000 rupiah").amount, 15_000);
  assert.equal(parse("bakso 15.000 rupiah").note, "Bakso");
  assert.equal(parse("bakso 15 ribu rupiah gopay").note, "Bakso");
  assert.equal(parse("bakso 15 ribu rupiah gopay").walletId, 2);
  assert.equal(parse("bakso 15 rebu").amount, 15_000);
  assert.equal(parse("bakso 15 rebu").note, "Bakso");
  assert.equal(parse("Bakso Rp15.000 pakai gopay.").note, "Bakso");
  assert.equal(parse("3 hari yang lalu ojek Rp18.000").daysAgo, 3);
  assert.equal(parse("parkir Rp500").amount, 500);
});

test("suara: nama dompet camelCase terbaca walau diucapkan terpisah", () => {
  const wallets: QuickWallet[] = [...WALLETS, { id: 5, name: "ShopeePay", type: "e-wallet" }];
  assert.equal(parse("bakso 15rb pakai go pay", wallets).walletId, 2);
  assert.equal(parse("bakso 15rb pakai go pay", wallets).note, "Bakso");
  assert.equal(parse("bakso 15rb shopee pay", wallets).walletId, 5);
  assert.equal(parse("bakso 15rb gopay", wallets).walletId, 2);
});

test("suara: nama layanan yang terucap terpisah", () => {
  assert.equal(parse("grab food 45rb").categoryKey, "makan_harian");
  assert.equal(parse("shopee food 30rb").categoryKey, "makan_harian");
  assert.equal(parse("go food 30rb").categoryKey, "makan_harian");
  assert.equal(parse("go ride 15rb").categoryKey, "transport");
  assert.equal(parse("grab 25rb").categoryKey, "transport");
  assert.equal(parse("wi fi 300rb").categoryKey, "pulsa_internet");
  assert.equal(parse("e toll 100rb").categoryKey, "transport");
});
