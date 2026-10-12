import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSpokenAmounts as N } from "./spoken-amount";

test("kata bilangan → Rp", () => {
  assert.equal(N("bakso lima belas ribu gopay"), "bakso Rp15.000 gopay");
  assert.equal(N("dua puluh lima ribu"), "Rp25.000");
  assert.equal(N("seratus ribu"), "Rp100.000");
  assert.equal(N("kopi seratus lima puluh ribu"), "kopi Rp150.000");
  assert.equal(N("sebelas ribu"), "Rp11.000");
  assert.equal(N("dua belas ribu"), "Rp12.000");
  assert.equal(N("lima belas ribu lima ratus"), "Rp15.500");
  assert.equal(N("sembilan puluh sembilan ribu sembilan ratus"), "Rp99.900");
  assert.equal(N("dua juta lima ratus ribu"), "Rp2.500.000");
  assert.equal(N("tanggal dua puluh lima kos satu juta dua ratus ribu"), "tanggal 25 kos Rp1.200.000");
});

test("se-, setengah, slang, rebu, bentuk lisan", () => {
  assert.equal(N("sejuta"), "Rp1.000.000");
  assert.equal(N("parkir seribu"), "parkir Rp1.000");
  assert.equal(N("satu setengah juta"), "Rp1.500.000");
  assert.equal(N("setengah juta"), "Rp500.000");
  assert.equal(N("parkir goceng"), "parkir Rp5.000");
  assert.equal(N("kopi ceban"), "kopi Rp10.000");
  assert.equal(N("parkir gopek"), "parkir Rp500");
  assert.equal(N("parkir dua rebu"), "parkir Rp2.000");
  assert.equal(N("tiga ribu lima"), "Rp3.500");
  assert.equal(N("sejuta dua"), "Rp1.200.000");
});

test("ratus / rupiah / perak = nominal jelas, bukan dianggap ribuan", () => {
  assert.equal(N("parkir lima ratus"), "parkir Rp500");
  assert.equal(N("parkir lima ratus perak"), "parkir Rp500");
  assert.equal(N("lima belas ribu rupiah"), "Rp15.000");
  assert.equal(N("15.000 rupiah"), "Rp15.000");
  assert.equal(N("15 ribu rupiah"), "Rp15.000");
  assert.equal(N("rp lima ratus"), "Rp500");
});

test("campuran digit + satuan", () => {
  assert.equal(N("2 juta 500 ribu"), "Rp2.500.000");
  assert.equal(N("jajan 2 ribu 500"), "jajan Rp2.500");
  assert.equal(N("beli 2 ribu 3 gelas"), "beli Rp2.000 3 gelas");
});

test("bilangan tanpa satuan uang = angka biasa (tanggal, jumlah)", () => {
  assert.equal(N("tiga hari yang lalu ojek delapan belas ribu"), "3 hari yang lalu ojek Rp18.000");
  assert.equal(N("tanggal sepuluh pulsa"), "tanggal 10 pulsa");
  assert.equal(N("bakso lima belas"), "bakso 15");
  assert.equal(N("beli satu bakso lima belas ribu"), "beli 1 bakso Rp15.000");
  assert.equal(N("nasi dua dua ribu"), "nasi 2 Rp2.000");
});

test("yang bukan bilangan tidak disentuh", () => {
  for (const s of ["makan setengah porsi", "belas kasihan", "satu-satunya kopi", "bakso 15.000 gopay", "Rp15.000", "3 hari lalu", "im3 50rb", "ribuan orang", "puluhan", "sate ayam", "limau", "ribut", "jutawan", ""]) {
    assert.equal(N(s), s);
  }
  assert.equal(N("sate dua puluh ribu"), "sate Rp20.000");
  assert.equal(N("Bakso Lima Belas Ribu, gopay."), "Bakso Rp15.000, gopay.");
});

test("satuan sesudah nominal yang diikuti kata hitungan bukan bagian nominal", () => {
  assert.equal(N("bensin lima puluh ribu dua hari yang lalu"), "bensin Rp50.000 2 hari yang lalu");
  assert.equal(N("ojek delapan belas ribu dua hari lalu"), "ojek Rp18.000 2 hari lalu");
  assert.equal(N("kopi dua puluh ribu dua gelas"), "kopi Rp20.000 2 gelas");
  assert.equal(N("pulsa sepuluh ribu dua kali"), "pulsa Rp10.000 2 kali");
  assert.equal(N("bensin 50.000 dua hari yang lalu"), "bensin 50.000 2 hari yang lalu");
  // bentuk lisan tetap jalan kalau tidak diikuti kata hitungan
  assert.equal(N("tiga ribu lima pakai gopay"), "Rp3.500 pakai gopay");
  assert.equal(N("parkir tiga ribu lima"), "parkir Rp3.500");
});

test("ratus tanpa harga lain = nominal; bersama harga yang jelas = jumlah", () => {
  assert.equal(N("daging sapi lima ratus gram delapan puluh ribu"), "daging sapi 500 gram Rp80.000");
  assert.equal(N("cabe dua ratus gram sepuluh ribu"), "cabe 200 gram Rp10.000");
  assert.equal(N("kertas seratus lembar dua puluh ribu"), "kertas 100 lembar Rp20.000");
  assert.equal(N("parkir lima ratus"), "parkir Rp500");
  assert.equal(N("rp lima ratus"), "Rp500");
});

test("setengah sesudah skala dan ratusan sesudah juta", () => {
  assert.equal(N("kos sejuta setengah"), "kos Rp1.500.000");
  assert.equal(N("dua ribu setengah"), "Rp2.500");
  assert.equal(N("nasi sepuluh ribu setengah porsi"), "nasi Rp10.000 setengah porsi");
  assert.equal(N("satu juta dua ratus"), "Rp1.200.000");
  assert.equal(N("dua juta tiga ratus"), "Rp2.300.000");
  assert.equal(N("sejuta dua ratus lima puluh"), "Rp1.250.000");
  assert.equal(N("2 juta 500"), "Rp2.500.000");
  assert.equal(N("dua juta lima ratus ribu"), "Rp2.500.000");
});

test("kunci prototipe bukan bilangan", () => {
  assert.equal(N("constructor"), "constructor");
  assert.equal(N("lima ribu constructor"), "Rp5.000 constructor");
  assert.equal(N("__proto__ seratus"), "__proto__ Rp100");
  assert.equal(N("toString valueOf hasOwnProperty"), "toString valueOf hasOwnProperty");
});
