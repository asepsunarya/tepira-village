"use client";

import { useMemo } from "react";
import { BRIDGE, DOCK, GOAL_PLOTS, HALL, LAMP_POSTS, LIGHTHOUSE, MARKET, POND, WALLET_ROW, WARUNG } from "../layout";
import { distToPath, insideIsland, mulberry32 } from "./geometry";

type Kind = "tree" | "pine" | "candy" | "bush" | "mushroom" | "flower" | "rock";
interface Item {
  kind: Kind;
  x: number;
  z: number;
  s: number;
  color: string;
  rot: number;
}

const GREENS = ["#7fcf6b", "#6abf5e", "#93d97c", "#5fb573", "#a6e38f"];
const CANDY = ["#f78fb3", "#ff6b6b", "#ffb3c6", "#c99cff"];
const FLOWERS = ["#ff8fb1", "#ffd166", "#ffffff", "#c3a0ff", "#ff9f68"];

function makeClear(usedPlots: number, walletCount: number, reserved: boolean) {
  return (x: number, z: number, pad: number) => {
    if (!insideIsland(x, z, 0.93)) return false;
    if (distToPath(x, z) < 1.4 + pad * 0.4) return false;
    for (let i = 0; i < Math.min(usedPlots, GOAL_PLOTS.length); i++) {
      const b = GOAL_PLOTS[i];
      if (Math.abs(b.x - x) < 3.6 + pad && Math.abs(b.z - z) < 3.8 + pad) return false;
    }
    if (Math.hypot(HALL.x - x, HALL.z - z) < 5.6 + pad) return false;
    if (Math.abs(WARUNG.x - x) < 3.8 + pad && Math.abs(WARUNG.z - z) < 4 + pad) return false;
    if (walletCount > 0) {
      const x1 = WALLET_ROW.x0 + (Math.min(walletCount, WALLET_ROW.max) - 1) * WALLET_ROW.gap;
      if (x > WALLET_ROW.x0 - 2 - pad && x < x1 + 2 + pad && Math.abs(z - WALLET_ROW.z) < 2.4 + pad) return false;
    }
    if (Math.hypot((POND.x - x) / (POND.rx + 1.2), (POND.z - z) / (POND.rz + 1.2)) < 1) return false;
    if (!reserved) return true;
    if (LAMP_POSTS.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 1 + pad)) return false;
    // Lokasi bangunan level selalu dikosongkan (juga sebelum terbuka) supaya pohon tidak bergeser saat level naik.
    if (Math.hypot(MARKET.x - x, MARKET.z - z) < 3.6 + pad) return false;
    if (Math.hypot(LIGHTHOUSE.x - x, LIGHTHOUSE.z - z) < 2.4 + pad) return false;
    if (Math.hypot(DOCK.x - x, DOCK.z - z) < 2.2 + pad) return false;
    if (Math.abs(BRIDGE.x - x) < 1.6 + pad && z > BRIDGE.z0 - 1.8 - pad) return false;
    return true;
  };
}

function layout(usedPlots: number, walletCount: number, reserved: boolean): Item[] {
  const rnd = mulberry32(20261008);
  const clear = makeClear(usedPlots, walletCount, reserved);
  const items: Item[] = [];
  const place = (kind: Kind, count: number, pad: number, colors: string[], smin: number, smax: number) => {
    let tries = 0;
    let placed = 0;
    while (placed < count && tries < count * 60) {
      tries++;
      const x = (rnd() * 2 - 1) * 26;
      const z = (rnd() * 2 - 1) * 21;
      if (!clear(x, z, pad)) continue;
      if (items.some((it) => Math.hypot(it.x - x, it.z - z) < 1.1 + pad)) continue;
      items.push({
        kind,
        x,
        z,
        s: smin + rnd() * (smax - smin),
        color: colors[Math.floor(rnd() * colors.length)],
        rot: rnd() * 6.28
      });
      placed++;
    }
  };
  place("tree", 30, 0.9, GREENS, 0.8, 1.3);
  place("pine", 9, 0.9, GREENS, 0.8, 1.2);
  place("candy", 7, 0.9, CANDY, 0.7, 1.1);
  place("bush", 24, 0.2, GREENS, 0.5, 0.9);
  place("mushroom", 8, 0.1, ["#ff5b5b", "#ff8fb1"], 0.5, 0.9);
  place("rock", 8, 0.1, ["#d9d0e6", "#cfc4dd"], 0.5, 0.9);
  place("flower", 60, -0.6, FLOWERS, 0.6, 1);
  return items;
}

/**
 * `reserved`: kosongkan juga tempat lampu streak & bangunan level. Desa contoh di landing tidak
 * memakainya supaya tata letaknya tetap sama dengan poster (public/landing/village-poster.png).
 */
export default function Decor({
  usedPlots,
  walletCount,
  reserved = false
}: {
  usedPlots: number;
  walletCount: number;
  reserved?: boolean;
}) {
  const items = useMemo(() => layout(usedPlots, walletCount, reserved), [usedPlots, walletCount, reserved]);
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={[it.x, 0, it.z]} rotation-y={it.rot} scale={it.s}>
          {it.kind === "tree" && (
            <>
              <mesh position-y={0.5} castShadow>
                <cylinderGeometry args={[0.16, 0.22, 1, 6]} />
                <meshStandardMaterial color="#b07d55" />
              </mesh>
              <mesh position-y={1.45} castShadow>
                <sphereGeometry args={[0.95, 10, 8]} />
                <meshStandardMaterial color={it.color} flatShading />
              </mesh>
              <mesh position={[0.35, 2.05, 0.1]} castShadow>
                <sphereGeometry args={[0.6, 10, 8]} />
                <meshStandardMaterial color={it.color} flatShading />
              </mesh>
            </>
          )}
          {it.kind === "pine" && (
            <>
              <mesh position-y={0.4} castShadow>
                <cylinderGeometry args={[0.14, 0.2, 0.8, 6]} />
                <meshStandardMaterial color="#9c6b45" />
              </mesh>
              <mesh position-y={1.2} castShadow>
                <coneGeometry args={[0.9, 1.3, 7]} />
                <meshStandardMaterial color={it.color} flatShading />
              </mesh>
              <mesh position-y={2.0} castShadow>
                <coneGeometry args={[0.65, 1.1, 7]} />
                <meshStandardMaterial color={it.color} flatShading />
              </mesh>
            </>
          )}
          {it.kind === "candy" && (
            <>
              <mesh position-y={0.6} castShadow>
                <cylinderGeometry args={[0.1, 0.14, 1.2, 6]} />
                <meshStandardMaterial color="#fff2f6" />
              </mesh>
              <mesh position-y={1.6} castShadow>
                <sphereGeometry args={[0.8, 12, 10]} />
                <meshStandardMaterial color={it.color} />
              </mesh>
            </>
          )}
          {it.kind === "bush" && (
            <mesh position-y={0.4} castShadow>
              <sphereGeometry args={[0.55, 8, 6]} />
              <meshStandardMaterial color={it.color} flatShading />
            </mesh>
          )}
          {it.kind === "mushroom" && (
            <>
              <mesh position-y={0.3} castShadow>
                <cylinderGeometry args={[0.18, 0.24, 0.6, 8]} />
                <meshStandardMaterial color="#fff6e8" />
              </mesh>
              <mesh position-y={0.7} castShadow>
                <sphereGeometry args={[0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color={it.color} />
              </mesh>
            </>
          )}
          {it.kind === "rock" && (
            <mesh position-y={0.25} castShadow>
              <dodecahedronGeometry args={[0.45, 0]} />
              <meshStandardMaterial color={it.color} flatShading />
            </mesh>
          )}
          {it.kind === "flower" && (
            <>
              <mesh position-y={0.18}>
                <cylinderGeometry args={[0.03, 0.03, 0.36, 4]} />
                <meshStandardMaterial color="#6abf5e" />
              </mesh>
              <mesh position-y={0.4}>
                <sphereGeometry args={[0.16, 8, 6]} />
                <meshStandardMaterial color={it.color} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}
