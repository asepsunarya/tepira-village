import { test } from "node:test";
import assert from "node:assert/strict";
import { cronAuthorized } from "./cron-auth";

test("cronAuthorized: hanya Bearer CRON_SECRET; tanpa rahasia semua ditolak", () => {
  const secret = "contoh-rahasia-cron-0123456789abcdef";
  assert.equal(cronAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(cronAuthorized(`Bearer ${secret}`, `  ${secret}\n`), true, "env berspasi tetap cocok");

  assert.equal(cronAuthorized(`Bearer ${secret}x`, secret), false);
  assert.equal(cronAuthorized(`bearer ${secret}`, secret), false);
  assert.equal(cronAuthorized(secret, secret), false);
  assert.equal(cronAuthorized("Bearer ", secret), false);
  assert.equal(cronAuthorized(null, secret), false);
  assert.equal(cronAuthorized(undefined, secret), false);
  // Gagal tertutup: CRON_SECRET kosong/tidak diisi tidak pernah membuka cron.
  assert.equal(cronAuthorized("Bearer ", ""), false);
  assert.equal(cronAuthorized("Bearer undefined", undefined), false);
  assert.equal(cronAuthorized("Bearer ", "   "), false);
});
