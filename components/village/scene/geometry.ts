import * as THREE from "three";
import { PATH_POINTS, POND, WALLET_ROW } from "../layout";

/** Radius garis pantai pada sudut a (sebelum diregangkan di sumbu x/z). */
export const islandRadius = (a: number) => 19 + 2.4 * Math.sin(3 * a + 0.4) + 1.3 * Math.cos(5 * a);
export const ISLAND_SX = 1.25;
export const ISLAND_SZ = 1.0;

/** true kalau (x,z) berada di dalam pulau yang dikecilkan sebesar `margin` (0..1). */
export function insideIsland(x: number, z: number, margin = 0.9) {
  const a = Math.atan2(z / ISLAND_SZ, x / ISLAND_SX);
  const r = Math.hypot(x / ISLAND_SX, z / ISLAND_SZ);
  return r < islandRadius(a) * margin;
}

/** Ekstrusi garis pantai jadi pulau berlapis: rumput di y = 0, dasar menyentuh laut. */
function extrudeIsland(pts: THREE.Vector2[], bevelSize: number) {
  const shape = new THREE.Shape(pts);
  const depth = 2.2;
  const bevel = 0.45;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize,
    bevelSegments: 3
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(depth + bevel), 0);
  g.computeVertexNormals();
  return g;
}

export function makeIslandGeometry() {
  const pts: THREE.Vector2[] = [];
  const N = 120;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = islandRadius(a);
    pts.push(new THREE.Vector2(Math.cos(a) * r * ISLAND_SX, -Math.sin(a) * r * ISLAND_SZ));
  }
  return extrudeIsland(pts, 0.5);
}

/** Pulau kecil (pulau kedua): garis pantai bergelombang lembut di sekitar `radius`. */
export function makeIsletGeometry(radius: number) {
  const pts: THREE.Vector2[] = [];
  const N = 48;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = radius * (1 + 0.07 * Math.sin(4 * a + 1) + 0.05 * Math.cos(7 * a));
    pts.push(new THREE.Vector2(Math.cos(a) * r, -Math.sin(a) * r));
  }
  return extrudeIsland(pts, 0.4);
}

/** Target jalan-jalan acak di darat, di luar kolam dan deretan peti dompet. */
export function randomWanderTarget(): [number, number] {
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() * 2 - 1) * 20;
    const z = (Math.random() * 2 - 1) * 15;
    const inPond = Math.hypot((POND.x - x) / (POND.rx + 1), (POND.z - z) / (POND.rz + 1)) < 1;
    const inWallets = z < WALLET_ROW.z + 2.5;
    if (insideIsland(x, z, 0.8) && !inPond && !inWallets) return [x, z];
  }
  return [0, 4];
}

const UP = new THREE.Vector3(0, 1, 0);

/** Posisi, rotasi, dan panjang silinder tipis dari titik a ke b (tali, tiang miring). */
export function segment(a: [number, number, number], b: [number, number, number]) {
  const va = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(va);
  const length = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return {
    position: va.add(dir.multiplyScalar(0.5)).toArray() as [number, number, number],
    rotation: [e.x, e.y, e.z] as [number, number, number],
    length
  };
}

export const pathCurve = new THREE.CatmullRomCurve3(
  PATH_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  "catmullrom",
  0.5
);

export const pathSamples: THREE.Vector3[] = pathCurve.getSpacedPoints(140);

export function distToPath(x: number, z: number) {
  let best = Infinity;
  for (const p of pathSamples) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best) best = d;
  }
  return best;
}

/** PRNG deterministik supaya dekorasi tidak berubah tiap render. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
