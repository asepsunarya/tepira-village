"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Label DOM yang "menempel" ke titik di dunia 3D tanpa membuat React root
 * terpisah per label (seperti drei <Html>). Satu registry dibagi antara
 * <LabelProjector/> (di dalam Canvas, memproyeksikan tiap frame) dan
 * <WorldLabel/> (di luar Canvas, elemen DOM biasa).
 */
export type Anchor = "above" | "center" | "below";

export interface LabelEntry {
  pos: THREE.Vector3;
  el: HTMLElement | null;
  anchor: Anchor;
}

export const labelRegistry = new Map<string, LabelEntry>();

export function ensureEntry(id: string, anchor: Anchor = "above") {
  let e = labelRegistry.get(id);
  if (!e) {
    e = { pos: new THREE.Vector3(), el: null, anchor };
    labelRegistry.set(id, e);
  }
  e.anchor = anchor;
  return e;
}

/** Daftarkan elemen DOM + posisi dunia statis. Posisi bisa dimutasi dari scene (mis. penduduk yang bergerak). */
export function useWorldLabel(id: string, position: [number, number, number], anchor: Anchor = "above") {
  const ref = useRef<HTMLDivElement>(null);
  const [x, y, z] = position;
  useEffect(() => {
    const e = ensureEntry(id, anchor);
    e.pos.set(x, y, z);
    e.el = ref.current;
    return () => {
      if (labelRegistry.get(id) === e) labelRegistry.delete(id);
    };
  }, [id, x, y, z, anchor]);
  return ref;
}

const ANCHOR_TRANSFORM: Record<Anchor, string> = {
  above: "translate(-50%, -100%)",
  center: "translate(-50%, -50%)",
  below: "translate(-50%, 0)"
};

export function anchorTransform(anchor: Anchor) {
  return ANCHOR_TRANSFORM[anchor];
}
