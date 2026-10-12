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
