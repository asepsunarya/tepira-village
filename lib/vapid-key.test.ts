import assert from "node:assert/strict";
import { test } from "node:test";
import { publicVapidKey } from "./vapid-key";

// Docker build: `ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""` + repo variable unset → Next inlines "" into the bundle.
test("kunci publik VAPID kosong dari build-arg = belum diatur, tidak melempar", () => {
  assert.equal(publicVapidKey(""), "");
  assert.equal(publicVapidKey(undefined), "");
  assert.equal(publicVapidKey('""'), "");
  assert.equal(publicVapidKey(' "" '), "");
  assert.doesNotThrow(() => publicVapidKey(""));
});
