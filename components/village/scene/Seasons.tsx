"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { festivalFor, type SeasonKey } from "@/lib/season";
import { LAMP_POSTS, SEA_Y } from "../layout";
import { useVillage } from "../store";
import type { TimeOfDay } from "../types";
import { MANGO, SEASON_SPOT, useReducedMotion } from "../seasons";
import { insideIsland, mulberry32, pathCurve } from "./geometry";

type Weather = Exclude<TimeOfDay, "auto">;

/**
 * Efek musim pulau (lib/season.ts). Hanya dipasang dari Scene.tsx; landing tidak memakainya.
 *
 * - Hujan: genangan di jalan setapak; gerimis hanya saat berawan/malam (arti cuaca berawan tetap),
 *   pelangi saat cerah, kunang-kunang saat senja/malam.
 * - Panen: kupu-kupu (siang/berawan). Kemarau & mangga: layangan (kecuali malam). Mangga: daun gugur.
 * - Agustus: bendera merah putih di ketujuh lampu jalan.
 * - Pojok musim di pelataran Balai Desa: diklik = buka jurnal.
 *
 * Anggaran ±10 draw call tambahan: partikel lewat instancedMesh/points, tidak ada yang melempar
 * bayangan. `ui.reduceFx` mematikan efek dekoratif (warna, genangan, pojok musim, & bendera tetap);
 * pengaturan sistem "kurangi gerakan" mematikan partikel yang bergerak (layangan & bendera jadi diam).
 */
export default function SeasonFx({ season, month, time }: { season: SeasonKey; month: number; time: Weather }) {
  const reduceFx = useVillage((s) => s.ui.reduceFx ?? false);
  const reducedMotion = useReducedMotion();
  const fx = !reduceFx;
  const moving = fx && !reducedMotion;
  const night = time === "night";
  return (
    <group>
      <SeasonProp season={season} />
      {season === "hujan" && <Puddles />}
      {festivalFor(month) === "agustusan" && <AgustusFlags still={!moving} />}
      {season === "hujan" && moving && (time === "cloudy" || night) && <Rain night={night} />}
      {season === "hujan" && fx && time === "day" && <Rainbow />}
      {season === "hujan" && moving && (time === "sunset" || night) && <Fireflies />}
      {(season === "kemarau" || season === "mangga") && fx && !night && (
        <Kites count={season === "kemarau" ? 3 : 2} still={reducedMotion} />
      )}
      {season === "mangga" && moving && <FallingLeaves />}
      {season === "panen" && moving && (time === "day" || time === "cloudy") && <Butterflies />}
    </group>
  );
}

const pointer = {
  onPointerOver: () => (document.body.style.cursor = "pointer"),
  onPointerOut: () => (document.body.style.cursor = "")
};

// ── Pojok musim ──────────────────────────────────────────────────────────────

/** Tinggi permukaan pelataran Balai Desa (silinder 0,12 di Hall.tsx). */
const PLAZA_Y = 0.12;

/** Diputar 45°: sumbu x lokal = kanan layar di sudut pandang awal, -x mengarah ke dinding balai. */
function SeasonProp({ season }: { season: SeasonKey }) {
  const setPanel = useVillage((s) => s.setPanel);
  return (
    <group
      position={[SEASON_SPOT.x, PLAZA_Y, SEASON_SPOT.z]}
      rotation-y={Math.PI / 4}
      onClick={(e) => {
        e.stopPropagation();
        setPanel("journal");
      }}
      {...pointer}
    >
      {season === "hujan" && <UmbrellaStand />}
      {season === "panen" && <Haystack />}
      {season === "kemarau" && <WaterJar />}
      {season === "mangga" && <MangoBasket />}
    </group>
  );
}

/** Hujan: payung terbuka tertancap & ember penampung air. */
function UmbrellaStand() {
  return (
    <>
      <group position={[0.3, 0, 0]} rotation-z={-0.16}>
        <mesh position-y={0.75}>
          <cylinderGeometry args={[0.035, 0.035, 1.5, 6]} />
          <meshStandardMaterial color="#8b6b4f" />
        </mesh>
        <mesh position-y={1.62}>
          <coneGeometry args={[0.85, 0.42, 8]} />
          <meshStandardMaterial color="#7cc3e8" flatShading />
        </mesh>
      </group>
      <mesh position={[-0.45, 0.17, 0.3]}>
        <cylinderGeometry args={[0.26, 0.2, 0.34, 12]} />
        <meshStandardMaterial color="#e86d6d" />
      </mesh>
      <mesh position={[-0.45, 0.33, 0.3]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.23, 12]} />
        <meshStandardMaterial color="#8fd3f4" />
      </mesh>
    </>
  );
}

/** Panen: tumpukan jerami & dua karung beras. */
function Haystack() {
  return (
    <>
      <mesh position-y={0.3}>
        <cylinderGeometry args={[0.55, 0.62, 0.6, 10]} />
        <meshStandardMaterial color="#f0cf6a" flatShading />
      </mesh>
      <mesh position-y={0.92}>
        <coneGeometry args={[0.58, 0.65, 10]} />
        <meshStandardMaterial color="#e9c46a" flatShading />
      </mesh>
      <mesh position={[0.78, 0.33, 0.2]} rotation-y={0.4} scale={[0.85, 1.15, 0.7]}>
        <sphereGeometry args={[0.3, 10, 8]} />
        <meshStandardMaterial color="#f5ecd7" />
      </mesh>
      <mesh position={[0.72, 0.28, -0.42]} rotation-y={-0.3} scale={[0.85, 1, 0.7]}>
        <sphereGeometry args={[0.3, 10, 8]} />
        <meshStandardMaterial color="#efe2c4" />
      </mesh>
    </>
  );
}

/** Kemarau: kendi air minum & caping di atas bale kecil. */
function WaterJar() {
  return (
    <>
      <mesh position-y={0.2}>
        <boxGeometry args={[1.1, 0.4, 0.6]} />
        <meshStandardMaterial color="#c99a66" />
      </mesh>
      <mesh position={[-0.2, 0.66, 0]} scale={[1, 0.9, 1]}>
        <sphereGeometry args={[0.28, 12, 10]} />
        <meshStandardMaterial color="#d9825b" />
      </mesh>
      <mesh position={[-0.2, 0.98, 0]}>
        <cylinderGeometry args={[0.07, 0.11, 0.2, 10]} />
        <meshStandardMaterial color="#c9714d" />
      </mesh>
      <mesh position={[0.28, 0.5, 0.02]}>
        <coneGeometry args={[0.36, 0.18, 12]} />
        <meshStandardMaterial color="#e9c46a" flatShading />
      </mesh>
    </>
  );
}

const BASKET_FRUIT: [number, number, number][] = [
  [0, 0.42, 0],
  [0.2, 0.38, 0.12],
  [-0.2, 0.38, 0.1],
  [0.05, 0.38, -0.22],
  [-0.12, 0.5, -0.05],
  [0.62, 0.12, 0.3]
];

/** Mangga: sekeranjang mangga, satu jatuh di sampingnya. */
function MangoBasket() {
  const fruit = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = fruit.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    BASKET_FRUIT.forEach(([x, y, z], i) => {
      o.position.set(x, y, z);
      o.rotation.set(0.3 * i, i, 0.5);
      o.scale.set(0.8, 1.15, 0.8);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <>
      <mesh position-y={0.18}>
        <cylinderGeometry args={[0.46, 0.34, 0.36, 12]} />
        <meshStandardMaterial color="#c99a66" flatShading />
      </mesh>
      <instancedMesh ref={fruit} args={[undefined, undefined, BASKET_FRUIT.length]} frustumCulled={false}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshStandardMaterial color={MANGO} />
      </instancedMesh>
    </>
  );
}

// ── Musim hujan ──────────────────────────────────────────────────────────────

/** Ubin jalan setapak (Path.tsx, 64 bagian) yang tergenang. */
const PUDDLE_TILES = [4, 13, 22, 31, 44, 55];

function Puddles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const pts = pathCurve.getSpacedPoints(64);
    const rnd = mulberry32(611);
    const o = new THREE.Object3D();
    PUDDLE_TILES.forEach((tile, i) => {
      // sedikit di atas ubin (tinggi 0,2) supaya tidak berkedip
      o.position.set(pts[tile].x, 0.205, pts[tile].z);
      o.rotation.set(-Math.PI / 2, 0, rnd() * Math.PI);
      o.scale.set(0.38 + rnd() * 0.12, 0.26 + rnd() * 0.08, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, PUDDLE_TILES.length]} frustumCulled={false}>
      <circleGeometry args={[1, 20]} />
      <meshStandardMaterial color="#a9d3ec" roughness={0.15} transparent opacity={0.85} depthWrite={false} />
    </instancedMesh>
  );
}

const RAIN = 180;
const RAIN_TOP = 18;
/** Kemiringan gerimis: x bertambah 0,08 per satuan tinggi (searah awan berjalan). */
const RAIN_SLANT = 0.08;

function Rain({ night }: { night: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const drops = useMemo(() => {
    const rnd = mulberry32(1101);
    return Array.from({ length: RAIN }, () => ({
      x: (rnd() * 2 - 1) * 28,
      z: (rnd() * 2 - 1) * 23,
      y: rnd() * RAIN_TOP,
      v: 13 + rnd() * 5
    }));
  }, []);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const dt = Math.min(delta, 0.05);
    drops.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < 0) d.y += RAIN_TOP;
      o.position.set(d.x + d.y * RAIN_SLANT, d.y, d.z);
      o.rotation.set(0, 0, -RAIN_SLANT);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, RAIN]} frustumCulled={false}>
      <boxGeometry args={[0.07, 0.9, 0.07]} />
      <meshBasicMaterial color={night ? "#c3ccff" : "#f2f7ff"} transparent opacity={0.7} depthWrite={false} />
    </instancedMesh>
  );
}

/** Warna pelangi pastel, dari lengkung dalam ke luar. */
const RAINBOW = ["#c9a7ff", "#9cc8ff", "#9fe3b0", "#fff19a", "#ffc98a", "#ff9fa8"];
const RAINBOW_IN = 7.6;
const RAINBOW_OUT = 9.2;
/**
 * Jarak pelangi dari tengah pulau, selalu di sisi seberang kamera. Kamera ortografis mengangkat
 * apa pun di balik pulau ke tepi atas layar (tertutup kontrol atas), jadi pelangi melengkung di atas
 * separuh belakang pulau: kakinya tenggelam di daratan, puncaknya ±11,5 satuan di atas tengah layar.
 */
const RAINBOW_DIST = 12;

/** Pelangi di atas bagian belakang pulau, pusatnya di permukaan laut; ikut berputar menghadap kamera. */
function Rainbow() {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(RAINBOW_IN, RAINBOW_OUT, 48, RAINBOW.length * 2, 0, Math.PI);
    const pos = g.getAttribute("position");
    const palette = RAINBOW.map((hex) => new THREE.Color(hex));
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = ((Math.hypot(pos.getX(i), pos.getY(i)) - RAINBOW_IN) / (RAINBOW_OUT - RAINBOW_IN)) * (palette.length - 1);
      const k = Math.max(0, Math.min(palette.length - 2, Math.floor(t)));
      c.copy(palette[k]).lerp(palette[k + 1], Math.min(1, Math.max(0, t - k)));
      c.toArray(colors, i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const mesh = ref.current;
    if (!mesh) return;
    camera.getWorldDirection(look);
    const az = Math.atan2(-look.x, -look.z);
    mesh.position.set(-Math.sin(az) * RAINBOW_DIST, SEA_Y, -Math.cos(az) * RAINBOW_DIST);
    mesh.rotation.y = az;
  });
  return (
    <mesh ref={ref} geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial vertexColors transparent opacity={0.62} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Titik bercahaya lembut untuk kunang-kunang (tekstur kanvas kecil, dibuat sekali). */
function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

const FIREFLIES = 36;

function Fireflies() {
  const flies = useMemo(() => {
    const rnd = mulberry32(2024);
    const list: { x: number; y: number; z: number; phase: number; speed: number }[] = [];
    while (list.length < FIREFLIES) {
      const x = (rnd() * 2 - 1) * 22;
      const z = (rnd() * 2 - 1) * 17;
      if (insideIsland(x, z, 0.85)) list.push({ x, z, y: 0.5 + rnd() * 1.8, phase: rnd() * Math.PI * 2, speed: 0.35 + rnd() * 0.5 });
    }
    return list;
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FIREFLIES * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(FIREFLIES * 3), 3));
    return g;
  }, []);
  const texture = useMemo(glowTexture, []);
  useEffect(
    () => () => {
      geometry.dispose();
      texture?.dispose();
    },
    [geometry, texture]
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = geometry.getAttribute("color") as THREE.BufferAttribute;
    flies.forEach((f, i) => {
      const a = t * f.speed + f.phase;
      pos.setXYZ(i, f.x + Math.sin(a) * 1.2, f.y + Math.sin(a * 1.7) * 0.35, f.z + Math.cos(a * 0.8) * 1.2);
      // berkedip pelan; warna yang lebih gelap = lebih redup (blending aditif)
      const glow = 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.2 + f.phase * 3)) ** 2;
      col.setXYZ(i, 0.85 * glow, glow, 0.45 * glow);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={8}
        sizeAttenuation={false}
        map={texture}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── Kemarau & mangga ─────────────────────────────────────────────────────────

/**
 * Layangan di atas separuh belakang pulau, talinya turun ke tanah lapang di depannya. Tingginya
 * dihitung untuk kamera awal (layar-atas ≈ 0,85·y − 0,375·(x+z)): ketiganya jatuh di pita ±8–10
 * satuan di atas tengah layar, kiri–tengah–kanan, tidak tertutup kontrol atas.
 */
const KITES: { kite: [number, number, number]; anchor: [number, number, number]; color: string }[] = [
  { kite: [-11.6, 6, 1.2], anchor: [-14, 0.1, 5], color: "#ff8fb1" },
  // ekornya tetap di atas atap kavling ke-8 (-3, -8)
  { kite: [-4, 8, -6.8], anchor: [-6, 0.1, -0.5], color: "#b391f0" },
  { kite: [3.7, 6.5, -10.4], anchor: [6, 0.1, -3.8], color: "#ffd166" }
];
const KITE_TAIL = 4;

/** Badan layangan: belah ketupat dengan rangka melintang agak ke atas. */
function kiteGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0.9, 0, 0.65, 0.25, 0, 0, -1.05, 0, -0.65, 0.25, 0]), 3));
  g.setIndex([0, 3, 1, 3, 2, 1]);
  g.computeVertexNormals();
  return g;
}

function Kites({ count, still }: { count: number; still: boolean }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const tails = useRef<THREE.InstancedMesh>(null);
  const shape = useMemo(kiteGeometry, []);
  const strings = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(KITES.length * 2 * 3), 3));
    g.setDrawRange(0, count * 2);
    return g;
  }, [count]);
  useEffect(() => () => shape.dispose(), [shape]);
  useEffect(() => () => strings.dispose(), [strings]);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      body.current?.setColorAt(i, c.set(KITES[i].color));
      for (let j = 0; j < KITE_TAIL; j++) tails.current?.setColorAt(i * KITE_TAIL + j, c.set(j % 2 ? "#ffffff" : KITES[i].color));
    }
    if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true;
    if (tails.current?.instanceColor) tails.current.instanceColor.needsUpdate = true;
  }, [count]);
  const o = useMemo(() => new THREE.Object3D(), []);
  const placed = useRef(false);
  useEffect(() => {
    placed.current = false;
  }, [still, count]);
  useFrame((state) => {
    const b = body.current;
    const tl = tails.current;
    if (!b || !tl || (still && placed.current)) return;
    placed.current = true;
    const t = still ? 0 : state.clock.elapsedTime;
    const line = strings.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const { kite, anchor } = KITES[i];
      const ph = i * 2.1;
      const x = kite[0] + Math.sin(t * 0.6 + ph) * 0.7;
      const y = kite[1] + Math.sin(t * 0.9 + ph) * 0.45;
      const z = kite[2] + Math.cos(t * 0.5 + ph) * 0.5;
      // menghadap orang yang menerbangkan, agak rebah ke belakang, bergoyang kiri-kanan
      const yaw = Math.atan2(anchor[0] - x, anchor[2] - z);
      o.position.set(x, y, z);
      o.rotation.set(-0.35, yaw, Math.sin(t * 1.3 + ph) * 0.25, "YXZ");
      o.scale.setScalar(1);
      o.updateMatrix();
      b.setMatrixAt(i, o.matrix);
      line.setXYZ(i * 2, x, y - 0.1, z);
      line.setXYZ(i * 2 + 1, anchor[0], anchor[1], anchor[2]);
      for (let j = 0; j < KITE_TAIL; j++) {
        o.position.set(x + Math.sin(t * 2 + j * 0.9 + ph) * 0.1 * (j + 1), y - 1.2 - j * 0.36, z);
        o.rotation.set(0, yaw, Math.sin(t * 3 + j) * 0.5, "YXZ");
        o.updateMatrix();
        tl.setMatrixAt(i * KITE_TAIL + j, o.matrix);
      }
    }
    b.instanceMatrix.needsUpdate = true;
    tl.instanceMatrix.needsUpdate = true;
    line.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={body} args={[shape, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={tails} args={[undefined, undefined, count * KITE_TAIL]} frustumCulled={false}>
        <boxGeometry args={[0.24, 0.1, 0.03]} />
        <meshStandardMaterial />
      </instancedMesh>
      <lineSegments geometry={strings} frustumCulled={false}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.7} />
      </lineSegments>
    </group>
  );
}

const LEAVES = 14;
const LEAF_COLORS = ["#f3b562", "#e6a35a", "#ffd166", "#d98c5f", "#c9d65a"];

interface Leaf {
  x: number;
  y: number;
  z: number;
  v: number;
  sway: number;
  spin: number;
  phase: number;
}

/** Daun baru di atas titik acak di darat, setinggi pucuk pohon. */
function spawnLeaf(rnd: () => number, leaf: Leaf, spread: number) {
  for (let k = 0; k < 20; k++) {
    leaf.x = (rnd() * 2 - 1) * 22;
    leaf.z = (rnd() * 2 - 1) * 17;
    if (insideIsland(leaf.x, leaf.z, 0.85)) break;
  }
  leaf.y = 2.6 + rnd() * spread;
  leaf.v = 0.5 + rnd() * 0.4;
  leaf.sway = 1 + rnd();
  leaf.spin = 1 + rnd() * 2;
  leaf.phase = rnd() * Math.PI * 2;
}

function FallingLeaves() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const rnd = useMemo(() => mulberry32(909), []);
  const leaves = useMemo(
    () =>
      Array.from({ length: LEAVES }, () => {
        const leaf: Leaf = { x: 0, y: 0, z: 0, v: 0, sway: 0, spin: 0, phase: 0 };
        spawnLeaf(rnd, leaf, 4.5);
        return leaf;
      }),
    [rnd]
  );
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const c = new THREE.Color();
    for (let i = 0; i < LEAVES; i++) mesh.setColorAt(i, c.set(LEAF_COLORS[i % LEAF_COLORS.length]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((state, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    leaves.forEach((l, i) => {
      l.y -= l.v * dt;
      if (l.y < 0.05) spawnLeaf(rnd, l, 2.5);
      o.position.set(l.x + Math.sin(t * l.sway + l.phase) * 0.6, l.y, l.z + Math.cos(t * l.sway * 0.7 + l.phase) * 0.3);
      o.rotation.set(t * l.spin + l.phase, t * l.spin * 0.6, l.phase);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, LEAVES]} frustumCulled={false}>
      <planeGeometry args={[0.36, 0.22]} />
      <meshStandardMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

// ── Musim panen ──────────────────────────────────────────────────────────────

const BUTTERFLIES = 10;
const WING_COLORS = ["#ffd166", "#ffffff", "#ffa86b", "#ff9fb8", "#9cc8ff"];

function Butterflies() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const flock = useMemo(() => {
    const rnd = mulberry32(3003);
    const list: { cx: number; cz: number; r: number; y: number; speed: number; phase: number }[] = [];
    while (list.length < BUTTERFLIES) {
      const cx = (rnd() * 2 - 1) * 20;
      const cz = (rnd() * 2 - 1) * 15;
      if (!insideIsland(cx, cz, 0.8)) continue;
      list.push({
        cx,
        cz,
        r: 0.8 + rnd() * 1.6,
        y: 0.7 + rnd() * 0.8,
        speed: (0.5 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1),
        phase: rnd() * Math.PI * 2
      });
    }
    return list;
  }, []);
  // Sayap: engsel di x = 0, terbentang ke +x, rebah di bidang XZ (badan searah sumbu z).
  const wing = useMemo(() => new THREE.PlaneGeometry(0.44, 0.34).rotateX(-Math.PI / 2).translate(0.22, 0, 0), []);
  useEffect(() => () => wing.dispose(), [wing]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const c = new THREE.Color();
    for (let i = 0; i < BUTTERFLIES * 2; i++) mesh.setColorAt(i, c.set(WING_COLORS[(i >> 1) % WING_COLORS.length]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    flock.forEach((b, i) => {
      const a = t * b.speed + b.phase;
      const x = b.cx + Math.cos(a) * b.r;
      const z = b.cz + Math.sin(a) * b.r * 0.7;
      const y = b.y + Math.sin(t * 2.3 + b.phase) * 0.25;
      // arah terbang = turunan lintasan elips
      const yaw = Math.atan2(-Math.sin(a) * b.r * b.speed, Math.cos(a) * b.r * 0.7 * b.speed);
      const flap = 0.25 + Math.sin(t * 16 + b.phase) * 0.85;
      for (let w = 0; w < 2; w++) {
        const side = w === 0 ? 1 : -1;
        o.position.set(x, y, z);
        o.rotation.set(0, yaw, side * flap, "YZX");
        o.scale.set(side, 1, 1);
        o.updateMatrix();
        mesh.setMatrixAt(i * 2 + w, o.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[wing, undefined, BUTTERFLIES * 2]} frustumCulled={false}>
      <meshStandardMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

// ── Agustusan ────────────────────────────────────────────────────────────────

/** Bendera merah putih kecil di tiap lampu jalan, tepat di bawah kepala lampu. */
function AgustusFlags({ still }: { still: boolean }) {
  const red = useRef<THREE.InstancedMesh>(null);
  const white = useRef<THREE.InstancedMesh>(null);
  const m = useMemo(() => ({ post: new THREE.Matrix4(), flag: new THREE.Matrix4() }), []);
  const placed = useRef(false);
  useEffect(() => {
    placed.current = false;
  }, [still]);
  useFrame((state) => {
    const r = red.current;
    const w = white.current;
    if (!r || !w || (still && placed.current)) return;
    placed.current = true;
    const t = still ? 0 : state.clock.elapsedTime;
    LAMP_POSTS.forEach(([x, z], i) => {
      // menghadap kamera awal, berayun pelan di tiang
      m.post.makeRotationY(Math.PI / 4 + Math.sin(t * 2.2 + i * 1.3) * 0.18).setPosition(x, 0, z);
      r.setMatrixAt(i, m.flag.makeTranslation(0.36, 1.98, 0).premultiply(m.post));
      w.setMatrixAt(i, m.flag.makeTranslation(0.36, 1.78, 0).premultiply(m.post));
    });
    r.instanceMatrix.needsUpdate = true;
    w.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={red} args={[undefined, undefined, LAMP_POSTS.length]} frustumCulled={false}>
        <boxGeometry args={[0.6, 0.2, 0.03]} />
        <meshStandardMaterial color="#e0393e" />
      </instancedMesh>
      <instancedMesh ref={white} args={[undefined, undefined, LAMP_POSTS.length]} frustumCulled={false}>
        <boxGeometry args={[0.6, 0.2, 0.03]} />
        <meshStandardMaterial color="#fbfbfb" />
      </instancedMesh>
    </group>
  );
}
