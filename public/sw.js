/*
 * Service worker tepira village: HANYA web push (pengingat lampu & tukang pos).
 * Sengaja tanpa handler fetch: tidak ada cache / mode offline, halaman selalu dari server.
 * Isi notifikasi datang dari server (lib/reminders.ts) dan tidak pernah memuat nominal.
 */
const DEFAULT_URL = "/village";
/** Hanya /village…: tolak "//host" dan alamat luar. */
const safeUrl = (u) => (typeof u === "string" && /^\/village(\?|$)/.test(u) ? u : DEFAULT_URL);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  // Selalu tampilkan notifikasi: push tanpa notifikasi bisa membuat browser (terutama Safari) mencabut izin.
  const title = typeof data.title === "string" && data.title ? data.title : "tepira village";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "Ada kabar dari desamu.",
      icon: "/icon-192.png",
      tag: typeof data.tag === "string" && data.tag ? data.tag : "tepira",
      lang: "id",
      data: { url: safeUrl(data.url) }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(safeUrl(data.url), self.location.origin);
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = wins.find((c) => new URL(c.url).pathname.startsWith("/village"));
      if (open) {
        // Desa yang sudah terbuka membuka panelnya sendiri (usePushBridge), tanpa memuat ulang.
        open.postMessage({ type: "tepira:buka", buka: target.searchParams.get("buka") });
        try {
          await open.focus();
          return;
        } catch {
          // jendelanya baru saja ditutup: buka yang baru
        }
      }
      await self.clients.openWindow(target.href);
    })()
  );
});
