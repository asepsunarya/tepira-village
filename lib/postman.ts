/**
 * Keputusan murni Pak Pos (components/village/scene/Postman.tsx), terpisah dari three.js supaya bisa dites.
 * Fase: hidden (diparkir tak terlihat di pantai dermaga) → in (berjalan ke kotak pos) → deliver (memasukkan
 * amplop) → wait (menunggu selama ada tagihan) → out (pulang) → hidden.
 */
export type PostmanPhase = "hidden" | "in" | "deliver" | "wait" | "out";

export interface PostmanArrival {
  phase: PostmanPhase;
  /** amplop langsung dianggap sampai (deliverMail) */
  deliverNow: boolean;
  /** mulai berjalan dari dermaga (bukan dari tempatnya sekarang) */
  fromDock: boolean;
}

/**
 * Kiriman baru diumumkan (postman.nonce bertambah). `animate` = false kalau sistem minta kurangi gerakan,
 * atau store memutuskan tanpa animasi (tur sedang jalan, layar penuh terbuka): Pak Pos tidak berjalan,
 * langsung dianggap tiba. Yang sedang berjalan disembunyikan; fase "hidden" lalu menaruhnya di depan kotak
 * pos kalau ada tagihan (postmanStandsAtMailbox).
 */
export function postmanOnNewMail(phase: PostmanPhase, animate: boolean): PostmanArrival {
  if (!animate) return { phase: phase === "in" || phase === "out" ? "hidden" : phase, deliverNow: true, fromDock: false };
  if (phase === "wait" || phase === "deliver") return { phase: "deliver", deliverNow: true, fromDock: false };
  return { phase: "in", deliverNow: false, fromDock: phase === "hidden" };
}

/**
 * Fase "hidden": langsung berdiri di depan kotak pos (tanpa berjalan) hanya untuk tagihan yang sudah
 * diantar DAN sudah diumumkan. Tagihan baru (juga yang datang bersama snapshot pertama) menunggu
 * pengumumannya, supaya Pak Pos berjalan dari dermaga.
 */
export const postmanStandsAtMailbox = (bills: number, delivered: boolean) => bills > 0 && delivered;

/**
 * Pak Pos yang tersembunyi tetap ada di scene (diparkir di titik papan/dermaga). three.js tidak memeriksa
 * `visible` saat raycast, jadi selama tersembunyi ia tidak boleh menangkap klik & kursor apa pun.
 */
export const postmanHittable = (phase: PostmanPhase) => phase !== "hidden";
