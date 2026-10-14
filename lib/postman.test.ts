import { test } from "node:test";
import assert from "node:assert/strict";
import { postmanHittable, postmanOnNewMail, postmanStandsAtMailbox } from "./postman";

test("Pak Pos tersembunyi tidak bisa diklik / disorot (#13)", () => {
  assert.equal(postmanHittable("hidden"), false, "diparkir di papan dermaga: klik diteruskan ke papan");
  for (const phase of ["in", "deliver", "wait", "out"] as const) assert.equal(postmanHittable(phase), true, phase);
});

test("kiriman baru tanpa animasi (tur jalan, layar penuh, kurangi gerakan): tidak berjalan dari dermaga (#15)", () => {
  // Store memutuskan walk=false: langsung tiba, tidak pernah fase "in".
  assert.deepEqual(postmanOnNewMail("hidden", false), { phase: "hidden", deliverNow: true, fromDock: false });
  assert.deepEqual(postmanOnNewMail("in", false), { phase: "hidden", deliverNow: true, fromDock: false }, "yang sedang berjalan disembunyikan");
  assert.deepEqual(postmanOnNewMail("out", false), { phase: "hidden", deliverNow: true, fromDock: false });
  assert.deepEqual(postmanOnNewMail("wait", false), { phase: "wait", deliverNow: true, fromDock: false }, "yang sudah di kotak pos diam");
  // Dengan animasi: berjalan dari dermaga, atau mengantar lagi kalau sudah di kotak pos.
  assert.deepEqual(postmanOnNewMail("hidden", true), { phase: "in", deliverNow: false, fromDock: true });
  assert.deepEqual(postmanOnNewMail("out", true), { phase: "in", deliverNow: false, fromDock: false });
  assert.deepEqual(postmanOnNewMail("wait", true), { phase: "deliver", deliverNow: true, fromDock: false });
});

test("berdiri langsung di kotak pos hanya untuk tagihan yang sudah diantar & diumumkan (#14)", () => {
  assert.equal(postmanStandsAtMailbox(2, true), true);
  assert.equal(postmanStandsAtMailbox(2, false), false, "tagihan baru menunggu Pak Pos berjalan dari dermaga");
  assert.equal(postmanStandsAtMailbox(0, true), false);
});
