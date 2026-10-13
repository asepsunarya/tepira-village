"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isDemoSnapshot } from "@/lib/demo-snapshot";
import { REMINDER_TIMES, type ReminderPrefs, type ReminderStatus } from "@/lib/reminders";
import {
  forgetPushDevice,
  getReminderStatus,
  savePushSubscription,
  sendTestPush,
  updateReminderPrefs
} from "@/app/village/push-actions";
import { writePushWanted } from "../daily";
import {
  currentSubscription,
  disablePushHere,
  enablePush,
  notificationPermission,
  pushEnv,
  type PushEnv
} from "../push";
import { useVillage } from "../store";

type Note = { text: string; ok: boolean } | null;

const PREF_ROWS: { key: keyof ReminderPrefs; title: string; desc: string }[] = [
  {
    key: "lampReminder",
    title: "💡 Lampu hari ini belum menyala",
    desc: `${REMINDER_TIMES.lamp}, kalau hari ini belum ada catatan dan belum ditandai nol pengeluaran.`
  },
  {
    key: "billReminder",
    title: "📬 Tukang pos membawa tagihan",
    desc: `${REMINDER_TIMES.bills}, kalau ada tagihan rutin jatuh tempo atau yang dicatat otomatis hari ini.`
  }
];

/**
 * 🔔 Pengingat di panel Perkembangan desa. Perangkat ini (langganan push browser) dinyalakan /
 * dimatikan sendiri-sendiri; jenis pengingatnya (lampu, tagihan) pilihan akun, berlaku di semua
 * perangkat. Isi notifikasi hanya jumlah, tanpa nominal. Tidak tampil di desa contoh landing.
 */
export default function ReminderSection() {
  const snapshot = useVillage((s) => s.snapshot);
  const owner = snapshot && !isDemoSnapshot(snapshot) ? snapshot.user.email : null;
  const [env, setEnv] = useState<PushEnv | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const refresh = useCallback(async () => {
    const e = pushEnv();
    setEnv(e);
    setPermission(notificationPermission());
    const sub = e === "ok" ? await currentSubscription() : null;
    const st = await getReminderStatus(sub?.endpoint ?? null);
    setEndpoint(sub?.endpoint ?? null);
    setStatus(st);
    // Terdaftar di akun & izin ada → perangkat ini memang mau dikabari (mis. storage sempat dibersihkan).
    if (owner && st.registered && notificationPermission() === "granted") writePushWanted(owner, true);
  }, [owner]);

  useEffect(() => {
    if (!owner) return;
    refresh().catch(() => setStatus(null));
  }, [owner, refresh]);

  if (!owner) return null;

  const onEnable = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    // requestPermission harus jadi await pertama setelah klik (lihat enablePush).
    const res = await enablePush();
    setPermission(notificationPermission());
    if (!res.ok) {
      setNote({ text: res.message, ok: false });
      setBusy(false);
      return;
    }
    const saved = await savePushSubscription(res.sub);
    if (saved.ok) {
      writePushWanted(owner, true);
      setEndpoint(res.sub.endpoint ?? null);
      setStatus(saved.status);
      setNote({ text: "🔔 Pengingat menyala di perangkat ini. Coba \"Kirim tes\".", ok: true });
    } else {
      setNote({ text: saved.message, ok: false });
    }
    setBusy(false);
  };

  const onDisable = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await disablePushHere(owner);
      await refresh();
      setNote({ text: "Pengingat dimatikan di perangkat ini.", ok: true });
    } catch {
      setNote({ text: "Gagal mematikan pengingat. Coba lagi.", ok: false });
    }
    setBusy(false);
  };

  const onTest = async () => {
    if (busy || !endpoint) return;
    setBusy(true);
    setNote(null);
    const res = await sendTestPush(endpoint);
    if (res.ok) setStatus(res.status);
    else await refresh().catch(() => undefined);
    setNote({ text: res.ok ? res.message ?? "Terkirim." : res.message, ok: res.ok });
    setBusy(false);
  };

  const onToggle = async (key: keyof ReminderPrefs) => {
    if (busy || !status) return;
    const before = status;
    const next = !status.prefs[key];
    setBusy(true);
    setNote(null);
    setStatus({ ...status, prefs: { ...status.prefs, [key]: next } });
    const res = await updateReminderPrefs({ [key]: next }, endpoint);
    if (res.ok) setStatus(res.status);
    else {
      setStatus(before);
      setNote({ text: res.message, ok: false });
    }
    setBusy(false);
  };

  const onForget = async (id: number) => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const res = await forgetPushDevice(id, endpoint);
    if (res.ok) setStatus(res.status);
    else setNote({ text: res.message, ok: false });
    setBusy(false);
  };

  let body: ReactNode;
  if (!env || !status) {
    body = <p className="muted small">Memeriksa pengingat…</p>;
  } else if (env === "not-configured" || !status.configured) {
    body = (
      <p className="muted small">
        Pengingat belum diatur di server ini (kunci VAPID belum diisi), jadi desa belum bisa mengirim notifikasi.
      </p>
    );
  } else if (!status.available) {
    body = (
      <p className="muted small">
        Pengingat belum siap di server (tabel database-nya belum dibuat). Coba lagi nanti, ya.
      </p>
    );
  } else {
    const here = status.registered && permission === "granted";
    const showPrefs = here || status.devices.length > 0;
    body = (
      <>
        {showPrefs ? (
          <p className="muted small">Isinya hanya jumlah, tanpa nominal, jadi aman di layar kunci.</p>
        ) : (
          <p className="muted small">
            Notifikasi singkat {REMINDER_TIMES.lamp} kalau lampu hari ini belum menyala, dan {REMINDER_TIMES.bills} kalau
            tukang pos membawa tagihan. Isinya hanya jumlah, tanpa nominal, jadi aman di layar kunci.
          </p>
        )}

        {env === "ios-install" ? (
          <p className="intro">
            Di iPhone/iPad pengingat hanya jalan dari ikon di Layar Utama: ketuk Bagikan (kotak berpanah ke atas) →{" "}
            <b>Tambahkan ke Layar Utama</b>, buka desa dari ikon itu (login sekali lagi), lalu nyalakan di sini.
            Butuh iOS 16.4 atau lebih baru.
          </p>
        ) : env === "unsupported" ? (
          <p className="intro">
            Browser ini belum mendukung pengingat. Coba Chrome atau Edge, atau di iPhone pasang desa ke Layar Utama
            (iOS 16.4+).
          </p>
        ) : permission === "denied" ? (
          <p className="intro warn">
            Notifikasi untuk desa diblokir di browser ini. Buka pengaturan situs (ikon gembok di samping alamat) →
            Notifikasi → Izinkan, lalu muat ulang halaman.
          </p>
        ) : here ? (
          <div className="journal-fx reminder-here">
            <span className="muted small">✅ Perangkat ini menerima pengingat.</span>
            <div className="reminder-actions">
              <button className="pill" disabled={busy} onClick={() => void onTest()}>
                Kirim tes
              </button>
              <button className="pill" disabled={busy} onClick={() => void onDisable()}>
                Matikan
              </button>
            </div>
          </div>
        ) : (
          <div className="journal-fx reminder-here">
            <span className="muted small">Perangkat ini belum menerima pengingat.</span>
            <button className="pill on" disabled={busy} onClick={() => void onEnable()}>
              🔔 Nyalakan
            </button>
          </div>
        )}

        {showPrefs && (
          <>
            {PREF_ROWS.map((row) => {
              const on = status.prefs[row.key];
              return (
                <div key={row.key} className="journal-fx">
                  <span className="muted small">
                    <b className="reminder-title">{row.title}</b>
                    {row.desc}
                  </span>
                  <button className={`pill ${on ? "on" : ""}`} aria-pressed={on} disabled={busy} onClick={() => void onToggle(row.key)}>
                    {on ? "Nyala" : "Mati"}
                  </button>
                </div>
              );
            })}
            <p className="muted small">Pilihan di atas berlaku untuk semua perangkatmu.</p>
          </>
        )}

        {status.devices.length > 0 && (
          <div className="reminder-devices">
            <small className="muted">Perangkat penerima:</small>
            <div className="chips">
              {status.devices.map((d) => (
                <span key={d.id} className={`pill ${d.here ? "on" : ""}`}>
                  {d.label}
                  {d.here ? " (ini)" : ""}
                  {!d.here && (
                    <button
                      className="reminder-forget"
                      disabled={busy}
                      onClick={() => void onForget(d.id)}
                      title="Berhenti mengirim pengingat ke perangkat ini"
                      aria-label={`Hapus ${d.label} dari penerima pengingat`}
                    >
                      ✕
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="reminders">
      <h3>🔔 Pengingat</h3>
      {body}
      {note && <p className={`intro ${note.ok ? "" : "warn"}`}>{note.text}</p>}
    </section>
  );
}
