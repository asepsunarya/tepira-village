"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { anchorTransform, labelRegistry } from "./labels";

const v = new THREE.Vector3();

/** Di dalam Canvas: tiap frame memindahkan semua label DOM ke posisi layar yang tepat. */
export default function LabelProjector() {
  useFrame(({ camera, size }) => {
    for (const e of labelRegistry.values()) {
      const el = e.el;
      if (!el) continue;
      v.copy(e.pos).project(camera);
      if (v.z > 1 || v.z < -1) {
        el.style.display = "none";
        continue;
      }
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.display = "";
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) ${anchorTransform(e.anchor)}`;
    }
  });
  return null;
}
