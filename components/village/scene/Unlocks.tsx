"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { VILLAGE_UNLOCKS, nextUnlock, type UnlockKey } from "@/lib/game";
import { BALLOON, BRIDGE, DOCK, ISLET, LIGHTHOUSE, MARKET, SEA_Y, UNLOCK_SPOTS } from "../layout";
import { useVillage } from "../store";
import { useVillageXp } from "../useProgress";
import { makeIsletGeometry, segment } from "./geometry";

type OpenHandler = (e: ThreeEvent<MouseEvent>) => void;
type Vec3 = [number, number, number];

const WOOD = "#c99a66";
const WOOD_ALT = "#b98a58";
const WOOD_DARK = "#8b6b4f";
const SKIN = "#ffe3cf";

const pointer = {
  onPointerOver: () => (document.body.style.cursor = "pointer"),
  onPointerOut: () => (document.body.style.cursor = "")
};

/** Bangunan yang terbuka sesuai level desa, plus papan "segera dibangun" untuk yang berikutnya. */
export default function Unlocks({ night }: { night: boolean }) {
  const { level } = useVillageXp();
  const setPanel = useVillage((s) => s.setPanel);
  const open: OpenHandler = (e) => {
    e.stopPropagation();
    setPanel("village");
  };
  const has = (key: UnlockKey) => level >= VILLAGE_UNLOCKS.find((u) => u.key === key)!.level;
  const next = nextUnlock(level);
  return (
    <group>
      {has("dermaga") && <Dock onClick={open} />}
      {has("pasar") && <Market onClick={open} night={night} />}
      {has("mercusuar") && <Lighthouse onClick={open} night={night} />}
      {has("pulau") && <Islet onClick={open} />}
      {has("balon") && <Balloon onClick={open} />}
      {/* Balon udara tidak punya tempat di darat; cukup disebut di panel. */}
      {next && next.key !== "balon" && <ComingSoon spot={UNLOCK_SPOTS[next.key]} onClick={open} />}
    </group>
  );
}

function Rope({ a, b, r = 0.025, color = WOOD_DARK }: { a: Vec3; b: Vec3; r?: number; color?: string }) {
  const s = segment(a, b);
  return (
    <mesh position={s.position} rotation={s.rotation}>
      <cylinderGeometry args={[r, r, s.length, 5]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// ── Lv4: dermaga ─────────────────────────────────────────────────────────────

/** Papan dari darat menjorok ke laut, tiang sampai permukaan air, perahu terayun di ujungnya. */
function Dock({ onClick }: { onClick: OpenHandler }) {
  const boat = useRef<THREE.Group>(null);
  const sail = useMemo(
    () => new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 1.1), new THREE.Vector2(0.75, 0)])),
    []
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!boat.current) return;
    boat.current.position.y = SEA_Y + 0.22 + Math.sin(t * 1.6) * 0.06;
    boat.current.rotation.z = Math.sin(t * 1.2) * 0.06;
  });
  // Tiang dari bawah papan sampai permukaan laut.
  const postH = 0.1 - SEA_Y;
  return (
    <group position={[DOCK.x, 0, DOCK.z]} rotation-y={DOCK.rot} onClick={onClick} {...pointer}>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[0, 0.12, -1.0 + i * 0.62]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.1, 0.56]} />
          <meshStandardMaterial color={i % 2 ? WOOD : WOOD_ALT} />
        </mesh>
      ))}
      {[2.4, 4.1, 5.8].flatMap((z) =>
        [-0.72, 0.72].map((x) => (
          <mesh key={`${x}:${z}`} position={[x, 0.1 - postH / 2, z]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, postH, 6]} />
            <meshStandardMaterial color={WOOD_DARK} />
          </mesh>
        ))
      )}
      {/* tiang tambat */}
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, 0.42, 5.9]} castShadow>
          <cylinderGeometry args={[0.1, 0.12, 0.55, 6]} />
          <meshStandardMaterial color={WOOD_DARK} />
        </mesh>
      ))}
      {/* tangga turun ke perahu */}
      {[-0.22, 0.22].map((dz) => (
        <mesh key={dz} position={[0.86, 0.1 - postH / 2, 5.2 + dz]}>
          <boxGeometry args={[0.06, postH, 0.06]} />
          <meshStandardMaterial color={WOOD_DARK} />
        </mesh>
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[0.86, -0.3 - i * 0.5, 5.2]}>
          <boxGeometry args={[0.05, 0.05, 0.5]} />
          <meshStandardMaterial color={WOOD_DARK} />
        </mesh>
      ))}
      <group ref={boat} position={[1.75, SEA_Y + 0.22, 5.0]} rotation-y={0.12}>
        <mesh castShadow>
          <boxGeometry args={[0.9, 0.34, 2.0]} />
          <meshStandardMaterial color="#7cc3e8" />
        </mesh>
        {/* haluan runcing: kotak diputar 45° yang diagonalnya = lebar lambung */}
        <mesh position={[0, 0, 1.0]} rotation-y={Math.PI / 4} castShadow>
          <boxGeometry args={[0.636, 0.34, 0.636]} />
          <meshStandardMaterial color="#7cc3e8" />
        </mesh>
        <mesh position-y={0.18}>
          <boxGeometry args={[0.94, 0.06, 2.04]} />
          <meshStandardMaterial color="#fff6ee" />
        </mesh>
        <mesh position={[0, 0.9, -0.1]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 1.5, 6]} />
          <meshStandardMaterial color={WOOD_DARK} />
        </mesh>
        <mesh geometry={sail} position={[0.03, 0.3, -0.05]} rotation-y={-Math.PI / 2} castShadow>
          <meshStandardMaterial color="#fff6ee" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

// ── Lv8: pasar ───────────────────────────────────────────────────────────────

const STALLS = [
  { x: -1.7, awning: "#f28cb4", shirt: "#7cc3e8", goods: ["#ff6b6b", "#ffd166", "#ff9f68"] },
  { x: 0, awning: "#7cc3e8", shirt: "#f0a06a", goods: ["#8fcf7e", "#6abf5e", "#c3e88d"] },
  { x: 1.7, awning: "#8fcf7e", shirt: "#c3a0ff", goods: ["#f78fb3", "#c3a0ff", "#ffd166"] }
];

/** Tiga lapak bertenda belang menghadap jalan, lengkap dengan pedagangnya. */
function Market({ onClick, night }: { onClick: OpenHandler; night: boolean }) {
  return (
    <group position={[MARKET.x, 0, MARKET.z]} rotation-y={MARKET.rot} onClick={onClick} {...pointer}>
      <mesh position-y={0.05} receiveShadow>
        <boxGeometry args={[5.6, 0.1, 2.6]} />
        <meshStandardMaterial color="#f7f2e9" />
      </mesh>
      {STALLS.map((s) => (
        <group key={s.x} position={[s.x, 0, 0]}>
          {/* pedagang */}
          <mesh position={[0, 0.55, -0.62]} castShadow>
            <capsuleGeometry args={[0.26, 0.35, 4, 8]} />
            <meshStandardMaterial color={s.shirt} />
          </mesh>
          <mesh position={[0, 1.08, -0.62]} castShadow>
            <sphereGeometry args={[0.27, 12, 10]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          <mesh position={[0, 1.33, -0.62]}>
            <coneGeometry args={[0.5, 0.26, 12]} />
            <meshStandardMaterial color="#e8c77a" flatShading />
          </mesh>
          {/* meja & dagangan */}
          <mesh position={[0, 0.42, 0.15]} castShadow receiveShadow>
            <boxGeometry args={[1.4, 0.5, 0.75]} />
            <meshStandardMaterial color={WOOD} />
          </mesh>
          {s.goods.map((c, i) => (
            <mesh key={i} position={[-0.42 + i * 0.42, 0.79, 0.18]} castShadow>
              <sphereGeometry args={[0.15, 8, 6]} />
              <meshStandardMaterial color={c} />
            </mesh>
          ))}
          {/* tiang & tenda belang */}
          {[-0.66, 0.66].flatMap((x) =>
            [0.5, -0.85].map((z) => (
              <mesh key={`${x}:${z}`} position={[x, 0.95, z]}>
                <boxGeometry args={[0.07, 1.7, 0.07]} />
                <meshStandardMaterial color={WOOD_DARK} />
              </mesh>
            ))
          )}
          {[-0.54, -0.18, 0.18, 0.54].map((x, i) => (
            <mesh key={x} position={[x, 1.86, -0.15]} rotation-x={0.22} castShadow>
              <boxGeometry args={[0.36, 0.06, 1.6]} />
              <meshStandardMaterial color={i % 2 ? "#fff6ee" : s.awning} />
            </mesh>
          ))}
        </group>
      ))}
      {night &&
        [-2.4, -1.2, 0, 1.2, 2.4].map((x) => (
          <mesh key={x} position={[x, 2.1, 0.8]}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshStandardMaterial color="#ffe7a0" emissive="#ffc94d" emissiveIntensity={1.8} />
          </mesh>
        ))}
    </group>
  );
}

// ── Lv15: mercusuar ──────────────────────────────────────────────────────────

/** Menara belang di tanjung timur; saat senja/malam sorot cahayanya berputar. */
function Lighthouse({ onClick, night }: { onClick: OpenHandler; night: boolean }) {
  const beam = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (beam.current) beam.current.rotation.y += Math.min(delta, 0.05) * 0.8;
  });
  const top = 6.3;
  return (
    <group position={[LIGHTHOUSE.x, 0, LIGHTHOUSE.z]} onClick={onClick} {...pointer}>
      <mesh position-y={0.15} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.7, 0.3, 10]} />
        <meshStandardMaterial color="#d9d0e6" flatShading />
      </mesh>
      {["#fff6ee", "#e86d6d", "#fff6ee"].map((c, i) => (
        <mesh key={i} position-y={1.3 + i * 2} castShadow receiveShadow>
          <cylinderGeometry args={[0.9 - 0.1 * i, 1.0 - 0.1 * i, 2, 14]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
      <mesh position={[0.67, 0.75, 0.67]} rotation-y={Math.PI / 4}>
        <boxGeometry args={[0.5, 0.9, 0.1]} />
        <meshStandardMaterial color="#a97a52" />
      </mesh>
      <mesh position-y={top + 0.08} castShadow>
        <cylinderGeometry args={[0.95, 0.95, 0.16, 14]} />
        <meshStandardMaterial color="#6f5b73" />
      </mesh>
      <mesh position-y={top + 0.56}>
        <cylinderGeometry args={[0.5, 0.5, 0.8, 12]} />
        <meshStandardMaterial color="#fff4c9" emissive="#ffe08a" emissiveIntensity={night ? 2.2 : 0.5} />
      </mesh>
      <mesh position-y={top + 1.31} castShadow>
        <coneGeometry args={[0.72, 0.7, 12]} />
        <meshStandardMaterial color="#e86d6d" />
      </mesh>
      <group ref={beam} position-y={top + 0.56} visible={night}>
        {[1, -1].map((side) => (
          // kerucut terbuka: ujungnya di lampu, mulutnya 10 satuan ke laut
          <mesh key={side} position={[side * 5, 0, 0]} rotation-z={(side * Math.PI) / 2}>
            <coneGeometry args={[1.3, 10, 16, 1, true]} />
            <meshBasicMaterial
              color="#fff3b0"
              transparent
              opacity={0.2}
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ── Lv25: pulau kedua ────────────────────────────────────────────────────────

const ISLET_FLOWERS: [number, number, string][] = [
  [-0.4, 2.3, "#ff8fb1"],
  [0.5, 2.6, "#ffd166"],
  [-2.4, -0.9, "#c3a0ff"],
  [2.6, -0.4, "#ffffff"]
];

/** Pulau kecil di selatan: pohon kelapa, saung, dan jembatan kayu ke pantai desa. */
function Islet({ onClick }: { onClick: OpenHandler }) {
  const geometry = useMemo(() => makeIsletGeometry(ISLET.r), []);
  return (
    <group onClick={onClick} {...pointer}>
      <group position={[ISLET.x, 0, ISLET.z]}>
        <mesh geometry={geometry} receiveShadow castShadow>
          <meshStandardMaterial attach="material-0" color="#a6dc78" />
          <meshStandardMaterial attach="material-1" color="#f3d6c2" />
        </mesh>
        <Palm position={[-1.7, 0, 0.9]} />
        <Palm position={[1.9, 0, 1.5]} scale={0.8} lean={-0.25} />
        <Saung position={[0.5, 0, -1.3]} />
        {ISLET_FLOWERS.map(([x, z, c]) => (
          <mesh key={`${x}:${z}`} position={[x, 0.3, z]}>
            <sphereGeometry args={[0.16, 8, 6]} />
            <meshStandardMaterial color={c} />
          </mesh>
        ))}
      </group>
      <Bridge />
    </group>
  );
}

function Palm({ position, scale = 1, lean = 0.25 }: { position: Vec3; scale?: number; lean?: number }) {
  return (
    <group position={position} scale={scale} rotation-z={lean}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[i * 0.08, 0.45 + i * 0.75, 0]} rotation-z={-0.06 * i} castShadow>
          <cylinderGeometry args={[0.13 - i * 0.015, 0.16 - i * 0.015, 0.8, 6]} />
          <meshStandardMaterial color={i % 2 ? "#b88a5a" : "#a97a52"} />
        </mesh>
      ))}
      <group position={[0.3, 3.3, 0]}>
        {Array.from({ length: 6 }, (_, i) => (
          <group key={i} rotation-y={(i / 6) * Math.PI * 2}>
            <mesh position={[0.65, -0.15, 0]} rotation-z={-0.45} castShadow>
              <boxGeometry args={[1.4, 0.06, 0.42]} />
              <meshStandardMaterial color={i % 2 ? "#6abf5e" : "#7fcf6b"} flatShading />
            </mesh>
          </group>
        ))}
        {[0, 2.1, 4.2].map((a) => (
          <mesh key={a} position={[Math.cos(a) * 0.18, -0.25, Math.sin(a) * 0.18]}>
            <sphereGeometry args={[0.13, 8, 6]} />
            <meshStandardMaterial color="#8b5e3c" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Saung({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation-y={0.5}>
      <mesh position-y={0.45} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.14, 1.6]} />
        <meshStandardMaterial color={WOOD} />
      </mesh>
      {[-0.7, 0.7].flatMap((x) =>
        [-0.7, 0.7].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.75, z]} castShadow>
            <boxGeometry args={[0.1, 1.5, 0.1]} />
            <meshStandardMaterial color={WOOD_DARK} />
          </mesh>
        ))
      )}
      <mesh position-y={1.9} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[1.45, 0.9, 4]} />
        <meshStandardMaterial color="#d9a066" flatShading />
      </mesh>
    </group>
  );
}

/** Jembatan kayu dari pantai selatan desa ke pulau kedua, sedikit melengkung ke bawah. */
function Bridge() {
  const len = BRIDGE.z1 - BRIDGE.z0;
  const n = 14;
  // tinggi lantai jembatan pada t ∈ [0, 1]
  const deck = (t: number) => 0.14 - Math.sin(Math.PI * t) * 0.32;
  const rail = (t: number) => deck(t) + 0.85 - Math.sin(Math.PI * t) * 0.1;
  const knots = Array.from({ length: 7 }, (_, i) => i / 6);
  return (
    <group position={[BRIDGE.x, 0, BRIDGE.z0]}>
      {Array.from({ length: n }, (_, i) => {
        const t = (i + 0.5) / n;
        return (
          <mesh key={i} position={[0, deck(t), t * len]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 0.08, len / n - 0.06]} />
            <meshStandardMaterial color={i % 2 ? WOOD : WOOD_ALT} />
          </mesh>
        );
      })}
      {[-0.68, 0.68].map((x) => (
        <group key={x}>
          {[0, 1].map((t) => (
            <mesh key={t} position={[x, deck(t) + 0.45, t * len]} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 1.0, 6]} />
              <meshStandardMaterial color={WOOD_DARK} />
            </mesh>
          ))}
          {knots.slice(1).map((t, i) => (
            <Rope key={t} a={[x, rail(knots[i]), knots[i] * len]} b={[x, rail(t), t * len]} />
          ))}
        </group>
      ))}
    </group>
  );
}

// ── Lv40: balon udara ────────────────────────────────────────────────────────

const BALLOON_COLORS = ["#ff7eb3", "#ffd23f", "#7cc3e8"];

/** Balon belang berputar pelan mengelilingi desa. */
function Balloon({ onClick }: { onClick: OpenHandler }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = t * 0.05;
    group.current?.position.set(
      BALLOON.x + Math.cos(a) * BALLOON.r,
      BALLOON.y + Math.sin(t * 0.6) * 0.4,
      BALLOON.z + Math.sin(a) * BALLOON.r
    );
  });
  return (
    <group ref={group} position={[BALLOON.x + BALLOON.r, BALLOON.y, BALLOON.z]} onClick={onClick} {...pointer}>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} scale={[1, 1.18, 1]} castShadow>
          <sphereGeometry args={[1.6, 6, 12, (i * Math.PI) / 3, Math.PI / 3]} />
          <meshStandardMaterial color={BALLOON_COLORS[i % 3]} flatShading />
        </mesh>
      ))}
      <mesh position-y={-1.95}>
        <cylinderGeometry args={[0.55, 0.35, 0.4, 10]} />
        <meshStandardMaterial color="#f3c35b" />
      </mesh>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ].map(([sx, sz]) => (
        <Rope key={`${sx}:${sz}`} a={[sx * 0.3, -2.1, sz * 0.3]} b={[sx * 0.26, -2.85, sz * 0.26]} r={0.015} />
      ))}
      <mesh position-y={-3.1} castShadow>
        <boxGeometry args={[0.65, 0.5, 0.65]} />
        <meshStandardMaterial color="#b07d55" />
      </mesh>
    </group>
  );
}

// ── Papan "segera dibangun" ──────────────────────────────────────────────────

const STAKES: [number, number][] = [
  [-1.1, -0.8],
  [1.1, -0.8],
  [1.1, 0.8],
  [-1.1, 0.8]
];

/** Papan kosong + patok bertali di lokasi bangunan level berikutnya (namanya di label dunia). */
function ComingSoon({ spot, onClick }: { spot: { x: number; z: number }; onClick: OpenHandler }) {
  return (
    <group position={[spot.x, 0, spot.z]} rotation-y={Math.PI / 4} onClick={onClick} {...pointer}>
      <mesh position-y={0.6} castShadow>
        <boxGeometry args={[0.1, 1.2, 0.1]} />
        <meshStandardMaterial color="#a97a52" />
      </mesh>
      <mesh position-y={1.25} castShadow>
        <boxGeometry args={[1.0, 0.55, 0.08]} />
        <meshStandardMaterial color="#f7e7c6" />
      </mesh>
      {STAKES.map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.25, z]}>
          <boxGeometry args={[0.08, 0.5, 0.08]} />
          <meshStandardMaterial color="#a97a52" />
        </mesh>
      ))}
      {STAKES.map(([x, z], i) => {
        const [nx, nz] = STAKES[(i + 1) % STAKES.length];
        return <Rope key={i} a={[x, 0.42, z]} b={[nx, 0.42, nz]} r={0.02} color="#ff9f68" />;
      })}
    </group>
  );
}
