import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEV_LOGIN_PROVIDER_ID,
  enabledDevLoginEmail,
  isAllowedDevLogin,
  isAllowedEmail,
  isAllowedGoogleProfile,
  isAllowedSession,
  isAllowedSignIn,
  parseAllowedEmails
} from "./auth-policy";

const devAccount = { provider: DEV_LOGIN_PROVIDER_ID, type: "credentials" };
const googleAccount = { provider: "google", type: "oidc" };

test("parseAllowedEmails: owner + daftar tambahan digabung, di-trim dan di-lowercase", () => {
  const allowed = parseAllowedEmails(" Owner@Example.test ", "a@example.test, B@Example.test ,,  ");
  assert.deepEqual([...allowed].sort(), ["a@example.test", "b@example.test", "owner@example.test"]);
});

test("parseAllowedEmails: tidak ada yang diisi = set kosong", () => {
  assert.equal(parseAllowedEmails().size, 0);
  assert.equal(parseAllowedEmails(undefined, undefined).size, 0);
  assert.equal(parseAllowedEmails(null, "").size, 0);
  assert.equal(parseAllowedEmails("   ", " , ,").size, 0);
});

test("parseAllowedEmails: entri yang bukan alamat email diabaikan", () => {
  const allowed = parseAllowedEmails("not-an-email", "@example.test, owner@, ok@example.test");
  assert.deepEqual([...allowed], ["ok@example.test"]);
});

test("isAllowedEmail: tidak peduli huruf besar/kecil, selain itu gagal tertutup", () => {
  const allowed = parseAllowedEmails("owner@example.test", "friend@example.test");
  assert.equal(isAllowedEmail("owner@example.test", allowed), true);
  assert.equal(isAllowedEmail("OWNER@Example.Test", allowed), true);
  assert.equal(isAllowedEmail(" friend@example.test ", allowed), true);

  assert.equal(isAllowedEmail("stranger@example.test", allowed), false);
  assert.equal(isAllowedEmail("owner@example.test.evil", allowed), false);
  assert.equal(isAllowedEmail("", allowed), false);
  assert.equal(isAllowedEmail(null, allowed), false);
  assert.equal(isAllowedEmail(undefined, allowed), false);
  assert.equal(isAllowedEmail(42, allowed), false);
  // Allowlist kosong tidak meloloskan siapa pun, termasuk owner.
  assert.equal(isAllowedEmail("owner@example.test", parseAllowedEmails()), false);
});

test("isAllowedGoogleProfile: email harus terverifikasi Google dan ada di allowlist", () => {
  const allowed = parseAllowedEmails("owner@example.test");
  assert.equal(isAllowedGoogleProfile({ email: "Owner@Example.test", email_verified: true }, allowed), true);

  assert.equal(isAllowedGoogleProfile({ email: "owner@example.test", email_verified: false }, allowed), false);
  assert.equal(isAllowedGoogleProfile({ email: "owner@example.test", email_verified: "true" }, allowed), false);
  assert.equal(isAllowedGoogleProfile({ email: "owner@example.test" }, allowed), false);
  assert.equal(isAllowedGoogleProfile({ email: "stranger@example.test", email_verified: true }, allowed), false);
  assert.equal(isAllowedGoogleProfile({ email_verified: true }, allowed), false);
  assert.equal(isAllowedGoogleProfile(null, allowed), false);
  assert.equal(isAllowedGoogleProfile(undefined, allowed), false);
  assert.equal(
    isAllowedGoogleProfile({ email: "owner@example.test", email_verified: true }, parseAllowedEmails()),
    false,
    "tanpa env allowlist tidak ada yang bisa login"
  );
});

test("enabledDevLoginEmail: hanya di luar production dan kalau DEV_LOGIN_EMAIL diisi", () => {
  assert.equal(enabledDevLoginEmail("development", "dev@tepira.local"), "dev@tepira.local");
  assert.equal(enabledDevLoginEmail("test", " dev@tepira.local \n"), "dev@tepira.local");
  assert.equal(enabledDevLoginEmail(undefined, "dev@tepira.local"), "dev@tepira.local");

  assert.equal(enabledDevLoginEmail("production", "dev@tepira.local"), null);
  assert.equal(enabledDevLoginEmail("development", undefined), null);
  assert.equal(enabledDevLoginEmail("development", ""), null);
  assert.equal(enabledDevLoginEmail("development", "   "), null);
});

test("isAllowedDevLogin: provider dev + Credentials + email dev saat login dev aktif", () => {
  const dev = "dev@tepira.local";
  assert.equal(isAllowedDevLogin(devAccount, { email: dev }, dev), true);
  assert.equal(isAllowedDevLogin(devAccount, { email: "DEV@Tepira.local" }, dev), true);

  // Login dev mati (production atau DEV_LOGIN_EMAIL kosong) = selalu ditolak.
  assert.equal(isAllowedDevLogin(devAccount, { email: dev }, null), false);
  assert.equal(isAllowedDevLogin(devAccount, { email: dev }, ""), false);
  // Email lain, provider lain, atau tipe akun lain tidak ikut lolos.
  assert.equal(isAllowedDevLogin(devAccount, { email: "stranger@example.test" }, dev), false);
  assert.equal(isAllowedDevLogin(devAccount, { email: null }, dev), false);
  assert.equal(isAllowedDevLogin(devAccount, null, dev), false);
  assert.equal(isAllowedDevLogin(googleAccount, { email: dev }, dev), false);
  assert.equal(isAllowedDevLogin({ provider: DEV_LOGIN_PROVIDER_ID, type: "oauth" }, { email: dev }, dev), false);
  assert.equal(isAllowedDevLogin(null, { email: dev }, dev), false);
  // Seperti hari ini: DEV_LOGIN_EMAIL tidak wajib berformat email.
  assert.equal(isAllowedDevLogin(devAccount, { email: "dev" }, "dev"), true);
});

test("isAllowedSignIn: Google lewat allowlist, login dev lewat aturan dev", () => {
  const allowed = parseAllowedEmails("owner@example.test", "friend@example.test");
  const dev = "dev@tepira.local";
  const verified = (email: string) => ({ email, email_verified: true });

  assert.equal(isAllowedSignIn({ account: googleAccount, profile: verified("owner@example.test") }, allowed, null), true);
  assert.equal(isAllowedSignIn({ account: googleAccount, profile: verified("Friend@Example.test") }, allowed, dev), true);
  assert.equal(isAllowedSignIn({ account: googleAccount, profile: verified("stranger@example.test") }, allowed, dev), false);
  assert.equal(
    isAllowedSignIn({ account: googleAccount, profile: { email: "owner@example.test", email_verified: false } }, allowed, null),
    false
  );
  // Email dev tidak membuka login Google: Google tetap hanya lewat allowlist.
  assert.equal(isAllowedSignIn({ account: googleAccount, profile: verified(dev) }, allowed, dev), false);

  assert.equal(isAllowedSignIn({ account: devAccount, user: { email: dev } }, allowed, dev), true);
  assert.equal(isAllowedSignIn({ account: devAccount, user: { email: dev } }, parseAllowedEmails(), dev), true);
  // Di production devEmail = null: login dev ditolak walau emailnya ada di allowlist.
  assert.equal(isAllowedSignIn({ account: devAccount, user: { email: "owner@example.test" } }, allowed, null), false);
  // Provider tanpa profil Google terverifikasi (mis. Credentials lain) ditolak.
  assert.equal(
    isAllowedSignIn({ account: { provider: "other", type: "credentials" }, user: { email: "owner@example.test" } }, allowed, dev),
    false
  );
  assert.equal(isAllowedSignIn({}, allowed, dev), false);
});

test("isAllowedSession: sesi berakhir untuk email di luar allowlist", () => {
  const allowed = parseAllowedEmails("owner@example.test");
  const dev = "dev@tepira.local";

  assert.equal(isAllowedSession("owner@example.test", allowed, null), true);
  assert.equal(isAllowedSession("OWNER@example.test", allowed, dev), true);
  assert.equal(isAllowedSession("stranger@example.test", allowed, null), false);
  assert.equal(isAllowedSession(undefined, allowed, dev), false);
  assert.equal(isAllowedSession(null, allowed, dev), false);
  // Sesi lama milik owner juga berakhir kalau env allowlist dikosongkan.
  assert.equal(isAllowedSession("owner@example.test", parseAllowedEmails(), null), false);

  // Login dev aktif: sesi email dev tetap hidup tanpa allowlist (npm run dev seperti sebelumnya).
  assert.equal(isAllowedSession(dev, parseAllowedEmails(), dev), true);
  // Login dev mati (production) atau DEV_LOGIN_EMAIL diganti: sesi email dev lama berakhir.
  assert.equal(isAllowedSession(dev, allowed, null), false);
  assert.equal(isAllowedSession(dev, allowed, "dev2@tepira.local"), false);
});
