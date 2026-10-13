"use client";

import { useEffect } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/village/push-actions";
import { readPushWanted, writePushWanted } from "./daily";
import { panelForBuka } from "@/lib/reminders";
import { currentSubscription, ensureSubscription, notificationPermission, pushEnv } from "./push";
import { useVillage } from "./store";

/**
 * Dipasang sekali di VillageApp (bukan di landing):
 * - klik notifikasi saat desa sudah terbuka: service worker mengirim `tepira:buka` → buka panelnya;
 * - klik saat desa tertutup: /village?buka=desa|pos → buka panelnya, lalu parameternya dibuang dari URL;
 * - perbaikan otomatis: kalau perangkat ini mau dikabari dan izinnya masih ada, langganan dipastikan
 *   ada (dibuat ulang kalau dicabut browser / kunci VAPID diganti) dan disimpan untuk akun ini; kalau
 *   izinnya dicabut, langganan di server ikut dihapus.
 */
export function usePushBridge(owner: string | null) {
  const setPanel = useVillage((s) => s.setPanel);

  useEffect(() => {
    const url = new URL(window.location.href);
    const target = panelForBuka(url.searchParams.get("buka"));
    if (url.searchParams.has("buka")) {
      url.searchParams.delete("buka");
      window.history.replaceState(window.history.state, "", url);
    }
    if (target) setPanel(target);
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; buka?: unknown } | null;
      if (data?.type !== "tepira:buka") return;
      const panel = panelForBuka(typeof data.buka === "string" ? data.buka : "desa");
      if (panel) setPanel(panel);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [setPanel]);

  useEffect(() => {
    if (!owner || pushEnv() !== "ok" || !readPushWanted(owner)) return;
    let cancelled = false;
    (async () => {
      const permission = notificationPermission();
      if (permission === "granted") {
        const sub = await ensureSubscription();
        if (!cancelled) await savePushSubscription(sub.toJSON());
      } else if (permission === "denied") {
        writePushWanted(owner, false);
        const sub = await currentSubscription();
        if (sub) await removePushSubscription(sub.endpoint);
      }
      // "default" (izin direset): menunggu tombol Nyalakan, prompt butuh gesture.
    })().catch((error) => console.warn("[push] perbaikan langganan gagal", error));
    return () => {
      cancelled = true;
    };
  }, [owner]);
}
