import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ENDPOINT_LENGTH, cleanUserAgent, deviceLabel, isPushServiceUrl, parsePushSubscription } from "./push-subscription";

// Kunci contoh berbentuk sah (bukan langganan sungguhan): p256dh 65 byte, auth 16 byte.
const P256DH = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
const AUTH = Buffer.alloc(16, 9).toString("base64url");
const sub = (endpoint: string, keys: Record<string, unknown> = { p256dh: P256DH, auth: AUTH }, extra = {}) => ({
  endpoint,
  keys,
  expirationTime: null,
  ...extra
});

test("parsePushSubscription: layanan push yang dikenal diterima", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/abc:APA91bXyz",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB",
    "https://web.push.apple.com/QGuQyavXutnMH7zw"
  ]) {
    const parsed = parsePushSubscription(sub(endpoint));
    assert.ok(parsed, endpoint);
    assert.equal(parsed.endpoint, endpoint);
    assert.equal(parsed.p256dh, P256DH);
    assert.equal(parsed.auth, AUTH);
    assert.equal(parsed.expirationTime, null);
  }
  // Padding "=" dari sebagian browser tetap diterima.
  assert.ok(parsePushSubscription(sub("https://fcm.googleapis.com/fcm/send/x", { p256dh: `${P256DH}=`, auth: `${AUTH}==` })));
  const exp = parsePushSubscription(sub("https://fcm.googleapis.com/fcm/send/x", undefined, { expirationTime: 1_800_000_000_000 }));
  assert.equal(exp?.expirationTime?.getTime(), 1_800_000_000_000);
});

test("parsePushSubscription: alamat & kunci yang tidak sah ditolak (cegah SSRF)", () => {
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/x",
    "https://evil.com/fcm.googleapis.com",
    "https://googleapis.com.evil.com/fcm/send/x",
    "https://fcm.googleapis.com.evil.com/x",
    "https://storage.googleapis.com/bucket/x",
    "https://notify.windows.com/x",
    "https://evilnotify.windows.com/x",
    "https://fcm.googleapis.com:8443/fcm/send/x",
    "https://user:pw@fcm.googleapis.com/fcm/send/x",
    "https://localhost/push",
    "https://127.0.0.1/push",
    "javascript:alert(1)",
    `https://fcm.googleapis.com/fcm/send/${"a".repeat(MAX_ENDPOINT_LENGTH)}`,
    ""
  ]) {
    assert.equal(parsePushSubscription(sub(endpoint)), null, endpoint);
  }
  const ok = "https://fcm.googleapis.com/fcm/send/x";
  assert.equal(parsePushSubscription(sub(ok, { p256dh: P256DH.replace(/^./, "+"), auth: AUTH })), null, "p256dh dengan +");
  assert.equal(parsePushSubscription(sub(ok, { p256dh: P256DH, auth: "abc" })), null, "auth terlalu pendek");
  assert.equal(parsePushSubscription(sub(ok, { p256dh: "x".repeat(200), auth: AUTH })), null, "p256dh terlalu panjang");
  assert.equal(parsePushSubscription(sub(ok, { auth: AUTH })), null, "tanpa p256dh");
  assert.equal(parsePushSubscription({ endpoint: ok }), null, "tanpa keys");
  for (const junk of [null, undefined, "x", 1, [], { endpoint: 5, keys: {} }]) {
    assert.equal(parsePushSubscription(junk), null);
  }
  assert.equal(isPushServiceUrl("not a url"), false);
});

test("deviceLabel & cleanUserAgent", () => {
  const cases: [string, string][] = [
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", "Chrome · Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari · iPhone"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0", "Edge · Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox · Mac"],
    ["Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36", "Samsung Internet · Android"],
    ["", "Perangkat lain"]
  ];
  for (const [ua, label] of cases) assert.equal(deviceLabel(ua), label);
  assert.equal(deviceLabel(null), "Perangkat lain");
  assert.ok(deviceLabel("x".repeat(500)).length <= 40);
  assert.equal(cleanUserAgent("  "), null);
  assert.equal(cleanUserAgent(null), null);
  assert.equal(cleanUserAgent("a".repeat(400))?.length, 300);
});
