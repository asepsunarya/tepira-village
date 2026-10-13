import { test } from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";
import { checkVapid, endpointHost, logSender, serverSender, validSubject, vapidKeysMatch, webPushSender } from "./push-send";
import { testMessage } from "./reminders";

// Kunci sekali pakai, hanya di memori proses tes (tidak pernah dicetak atau disimpan).
const keys = webpush.generateVAPIDKeys();
const other = webpush.generateVAPIDKeys();
const env = (over: Record<string, string | undefined> = {}) => ({
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
  VAPID_PRIVATE_KEY: keys.privateKey,
  VAPID_SUBJECT: "mailto:pemilik@contoh.id",
  ...over
});
const TARGET = { endpoint: "https://fcm.googleapis.com/fcm/send/rahasia-123", p256dh: "p", auth: "a" };

test("checkVapid: lengkap & berpasangan = siap; selain itu belum diatur", () => {
  const ok = checkVapid(env());
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.config.subject, "mailto:pemilik@contoh.id");
  // Nilai dari Vercel/.env kadang berkutip atau berspasi.
  assert.equal(checkVapid(env({ VAPID_PRIVATE_KEY: ` "${keys.privateKey}" ` })).ok, true);

  assert.deepEqual(checkVapid({}), { ok: false, problem: "missing" });
  assert.deepEqual(checkVapid(env({ VAPID_PRIVATE_KEY: "" })), { ok: false, problem: "missing" });
  assert.deepEqual(checkVapid(env({ VAPID_SUBJECT: "http://localhost:3000" })), { ok: false, problem: "subject" });
  assert.deepEqual(checkVapid(env({ VAPID_SUBJECT: "https://localhost" })), { ok: false, problem: "subject" });
  assert.deepEqual(checkVapid(env({ VAPID_PRIVATE_KEY: "bukan+base64url" })), { ok: false, problem: "keys" });
  // Kunci publik dari pasangan lain: ditolak sebelum mengirim (kalau tidak, semua langganan terhapus 403).
  assert.deepEqual(checkVapid(env({ VAPID_PRIVATE_KEY: other.privateKey })), { ok: false, problem: "mismatch" });
  assert.equal(vapidKeysMatch(keys.publicKey, keys.privateKey), true);
  assert.equal(vapidKeysMatch(other.publicKey, keys.privateKey), false);
  assert.equal(vapidKeysMatch("AAAA", "BBBB"), false);

  assert.equal(validSubject("mailto:a@b.id"), true);
  assert.equal(validSubject("https://desa.contoh.id"), true);
  assert.equal(validSubject("mailto:bukan-email"), false);
  assert.equal(validSubject("ftp://desa.contoh.id"), false);
});

test("webPushSender: opsi web-push per kiriman, status dari WebPushError", async () => {
  const calls: unknown[][] = [];
  const fake = (async (...args: unknown[]) => {
    calls.push(args);
    return { statusCode: 201, body: "", headers: {} };
  }) as unknown as typeof webpush.sendNotification;
  const cfg = checkVapid(env());
  assert.ok(cfg.ok);
  const send = webPushSender(cfg.config, fake);
  const payload = testMessage();
  assert.deepEqual(await send(TARGET, payload, { ttl: 120, topic: "tes" }), { ok: true, statusCode: 201 });
  const [subscription, body, options] = calls[0] as [unknown, string, Record<string, unknown>];
  assert.deepEqual(subscription, { endpoint: TARGET.endpoint, keys: { p256dh: "p", auth: "a" } });
  assert.deepEqual(JSON.parse(body), payload);
  assert.equal(options.TTL, 120);
  assert.equal(options.topic, "tes");
  assert.equal(options.urgency, "normal");
  assert.equal(options.timeout, 10_000);
  assert.deepEqual(options.vapidDetails, cfg.config);

  const gone = webPushSender(cfg.config, (async () => {
    throw new webpush.WebPushError("Received unexpected response code", 410, {}, "", TARGET.endpoint);
  }) as unknown as typeof webpush.sendNotification);
  assert.deepEqual(await gone(TARGET, payload, { ttl: 60, topic: "tes" }), { ok: false, statusCode: 410 });

  const offline = webPushSender(cfg.config, (async () => {
    throw new Error("socket hang up");
  }) as unknown as typeof webpush.sendNotification);
  assert.deepEqual(await offline(TARGET, payload, { ttl: 60, topic: "tes" }), { ok: false, statusCode: undefined });
});

test("logSender & serverSender: mode log tidak mengirim dan tidak mencatat endpoint lengkap", async () => {
  const logged: unknown[][] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => void logged.push(args);
  try {
    assert.deepEqual(await logSender(TARGET, testMessage(), { ttl: 60, topic: "tes" }), { ok: true, statusCode: 201 });
  } finally {
    console.info = original;
  }
  const line = logged.map((l) => l.join(" ")).join("\n");
  assert.match(line, /fcm\.googleapis\.com/);
  assert.doesNotMatch(line, /rahasia-123/);
  assert.equal(endpointHost("bukan url"), "?");

  assert.equal(serverSender({ PUSH_SEND_MODE: "log" }), logSender);
  assert.equal(serverSender({}), null);
  assert.equal(typeof serverSender(env()), "function");
});
