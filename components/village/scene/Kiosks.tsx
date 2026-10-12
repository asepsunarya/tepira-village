"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { expenseCategories } from "@/lib/categories";
import { fnv1a } from "@/lib/kiosks";
import { categoryColor } from "@/lib/places";
import { GOAL_PALETTE } from "../layout";
import type { PlacedKiosk } from "../kiosks";
import { useVillage } from "../store";
import { useKiosks } from "../usePlaces";

const WOOD = "#c99a66";
const WOOD_DARK = "#8b6b4f";
const SKIN = "#ffe3cf";
const CREAM = "#fff6ee";
const BOARD = "#f7e7c6";
/** Warna pudar untuk kios yang lewat batas. */
const FADED = "#b9ae9f";

const CUSTOMER_SPOTS: [number, number][] = [
  [-0.38, 1.15],
  [0.38, 1.15],
  [0, 1.55]
];
const SHIRTS = ["#7cc3e8", "#f0a06a", "#8fcf7e", "#c3a0ff", "#e9c46a", "#6cc8ad", "#f78fb3", "#b07d55"];
const HAIRS = ["#3a2b2b", "#5a4a5e", "#2f2433", "#6b4a3a"];

type Goods = "bowl" | "cup" | "box" | "ball";
const GOODS: Partial<Record<string, Goods>> = { makan_harian: "bowl", nongkrong: "cup", belanja_kecil: "box" };
const goodsFor = (category: string | null): Goods =>
  GOODS[expenseCategories.find((c) => c.label === category)?.key ?? ""] ?? "ball";

/** Kios tempat langganan di pulau: makin ramai kalau sering didatangi, tutup & layu kalau lewat batas. */
export default function Kiosks({ lit }: { lit: boolean }) {
  const kiosks = useKiosks();
  const openJajan = useVillage((s) => s.openJajan);
  const setHoverKiosk = useVillage((s) => s.setHoverKiosk);
  return (
    <group>
      {kiosks.map((k) => (
        <Kiosk
          key={k.key}
          kiosk={k}
          lit={lit}
          onOpen={() => openJajan(k.name)}
          onHover={(on) => {
            document.body.style.cursor = on ? "pointer" : "";
            if (on) setHoverKiosk(k.key);
            else if (useVillage.getState().hoverKiosk === k.key) setHoverKiosk(null);
          }}
        />
      ))}
    </group>
  );
}

function Kiosk({
  kiosk,
  lit,
  onOpen,
  onHover
}: {
  kiosk: PlacedKiosk;
  lit: boolean;
  onOpen: () => void;
  onHover: (on: boolean) => void;
}) {
  const { spot, busy, topCategory, key } = kiosk;
  const level = kiosk.status?.level ?? null;
  const over = level === "over";
  const hash = fnv1a(key);

  const colors = useMemo(() => {
    const accent = new THREE.Color(topCategory ? categoryColor(topCategory) : GOAL_PALETTE[hash % GOAL_PALETTE.length].roof);
    const body = accent.clone().lerp(new THREE.Color(CREAM), 0.72);
    if (over) {
      accent.lerp(new THREE.Color(FADED), 0.55);
      body.lerp(new THREE.Color(FADED), 0.55);
    }
    return { accent: `#${accent.getHexString()}`, body: `#${body.getHexString()}` };
  }, [topCategory, hash, over]);

  // Posisi awal saja yang diambil dari props; perubahan sesudahnya dijalankan useFrame (kalau props
  // ikut berubah, r3f langsung menimpa nilainya dan animasinya tidak terlihat).
  const [initialOver] = useState(over);
  const awning = useRef<THREE.Group>(null);
  const shutter = useRef<THREE.Mesh>(null);
  const flag = useRef<THREE.MeshStandardMaterial>(null);
  const crowd = useRef<THREE.Group>(null);
  const t = useRef(hash % 100);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    t.current += d;
    if (awning.current) {
      const target = over ? 0.95 : 0.25;
      awning.current.rotation.x += (target - awning.current.rotation.x) * Math.min(1, d * 4);
    }
    if (shutter.current) {
      const target = over ? 0.52 : 1.5;
      const y = shutter.current.position.y;
      shutter.current.position.y = y + (target - y) * Math.min(1, d * 4);
      shutter.current.visible = shutter.current.position.y < 1.42;
    }
    if (flag.current) flag.current.emissiveIntensity = 0.35 + Math.sin(t.current * 3) * 0.3;
    if (crowd.current) {
      crowd.current.children.forEach((c, i) => {
        c.rotation.z = Math.sin(t.current * 1.5 + i * 1.7) * 0.04;
      });
    }
  });

  const goods = goodsFor(topCategory);
  const customers = over ? 0 : Math.min(busy, CUSTOMER_SPOTS.length);
  const bulbsGlow = lit || busy >= 3;
  return (
    <group
      position={[spot.x, 0, spot.z]}
      rotation-y={spot.rot}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      {/* lantai */}
      <mesh position-y={0.05} receiveShadow>
        <boxGeometry args={[1.9, 0.1, 1.5]} />
        <meshStandardMaterial color={over ? "#e6dcc6" : "#f7f2e9"} />
      </mesh>
      {/* dinding belakang & atapnya */}
      <mesh position={[0, 0.78, -0.55]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.36, 0.3]} />
        <meshStandardMaterial color={colors.body} />
      </mesh>
      <mesh position={[0, 1.5, -0.55]} castShadow>
        <boxGeometry args={[1.66, 0.08, 0.44]} />
        <meshStandardMaterial color={colors.accent} />
      </mesh>
      {/* papan nama: nama tempat ada di label DOM, papannya cukup bingkai & ikon warna */}
      <group position={[0, 1.72, -0.55]}>
        <mesh>
          <boxGeometry args={[1.36, 0.4, 0.05]} />
          <meshStandardMaterial color={colors.accent} />
        </mesh>
        <mesh position-z={0.03}>
          <boxGeometry args={[1.24, 0.3, 0.04]} />
          <meshStandardMaterial color={BOARD} />
        </mesh>
        <mesh position={[-0.46, 0, 0.06]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.1, 0.1, 0.03, 14]} />
          <meshStandardMaterial color={colors.accent} />
        </mesh>
      </group>
      {/* pedagang */}
      {!over && (
        <group position={[0, 0, -0.18]} scale={0.85}>
          <mesh position-y={0.58} castShadow>
            <capsuleGeometry args={[0.24, 0.32, 4, 8]} />
            <meshStandardMaterial color={colors.accent} />
          </mesh>
          <mesh position-y={1.06} castShadow>
            <sphereGeometry args={[0.25, 12, 10]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          <mesh position-y={1.3}>
            <coneGeometry args={[0.46, 0.24, 12]} />
            <meshStandardMaterial color="#e8c77a" flatShading />
          </mesh>
        </group>
      )}
      {/* meja & dagangan */}
      <mesh position={[0, 0.43, 0.3]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.66, 0.45]} />
        <meshStandardMaterial color={over ? "#b49a80" : WOOD} />
      </mesh>
      <mesh position={[0, 0.79, 0.3]} receiveShadow>
        <boxGeometry args={[1.7, 0.06, 0.55]} />
        <meshStandardMaterial color={BOARD} />
      </mesh>
      {!over && <Wares kind={goods} accent={colors.accent} />}
      {/* tiang depan */}
      {[-0.78, 0.78].map((x) => (
        <mesh key={x} position={[x, 0.8, 0.62]} castShadow>
          <boxGeometry args={[0.07, 1.5, 0.07]} />
          <meshStandardMaterial color={WOOD_DARK} />
        </mesh>
      ))}
      {/* tenda belang: turun menutup saat lewat batas */}
      <group ref={awning} position={[0, 1.46, -0.38]} rotation-x={initialOver ? 0.95 : 0.25}>
        {[-0.63, -0.21, 0.21, 0.63].map((x, i) => (
          <mesh key={x} position={[x, 0, 0.5]} castShadow>
            <boxGeometry args={[0.42, 0.05, 1.04]} />
            <meshStandardMaterial color={i % 2 ? CREAM : colors.accent} />
          </mesh>
        ))}
      </group>
      {/* rana yang turun saat lewat batas */}
      <mesh ref={shutter} position={[0, initialOver ? 0.52 : 1.5, 0.56]} visible={initialOver}>
        <boxGeometry args={[1.5, 0.62, 0.05]} />
        <meshStandardMaterial color="#d8cfc4" />
      </mesh>
      {/* untaian bendera saat ramai */}
      {busy >= 2 && !over && (
        <group position={[0, 1.34, 0.64]}>
          {[-0.56, -0.28, 0, 0.28, 0.56].map((x, i) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.09, 0.18, 3]} />
              <meshStandardMaterial color={i % 2 ? "#ffd166" : colors.accent} flatShading />
            </mesh>
          ))}
        </group>
      )}
      {/* lampu bohlam: menyala saat senja/malam, atau siang hari kalau sangat ramai */}
      {(over ? [0] : [-0.5, 0, 0.5]).map((x) => (
        <mesh key={x} position={[x, 1.2, 0.68]}>
          <sphereGeometry args={[0.07, 8, 6]} />
          <meshStandardMaterial
            color="#ffe7a0"
            emissive="#ffc94d"
            emissiveIntensity={bulbsGlow ? (over ? 0.5 : lit ? 1.8 : 0.6) : 0}
          />
        </mesh>
      ))}
      {lit && busy >= 1 && !over && (
        <>
          <mesh position={[0, 1.15, 0.7]}>
            <sphereGeometry args={[0.9, 12, 10]} />
            <meshBasicMaterial color="#ffe7a0" transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.12, 0.9]}>
            <circleGeometry args={[1.2, 24]} />
            <meshBasicMaterial color="#ffe7a0" transparent opacity={0.18} depthWrite={false} />
          </mesh>
        </>
      )}
      {/* bendera kuning di sudut atap saat hampir batas */}
      {level === "warn" && (
        <group position={[0.72, 1.56, -0.62]}>
          <mesh position-y={0.2}>
            <cylinderGeometry args={[0.02, 0.02, 0.4, 5]} />
            <meshStandardMaterial color={WOOD_DARK} />
          </mesh>
          <mesh position={[0.1, 0.34, 0]} rotation-z={-Math.PI / 2}>
            <coneGeometry args={[0.1, 0.22, 3]} />
            <meshStandardMaterial ref={flag} color="#e0b84a" emissive="#e0b84a" emissiveIntensity={0.35} flatShading />
          </mesh>
        </group>
      )}
      <Plant wilted={over} />
      {/* pembeli */}
      <group ref={crowd}>
        {CUSTOMER_SPOTS.slice(0, customers).map(([x, z], i) => (
          <Customer
            key={i}
            position={[x, 0, z]}
            shirt={SHIRTS[(hash + i * 3) % SHIRTS.length]}
            hair={HAIRS[(hash + i) % HAIRS.length]}
          />
        ))}
      </group>
    </group>
  );
}

function Wares({ kind, accent }: { kind: Goods; accent: string }) {
  const xs = [-0.5, 0, 0.5];
  return (
    <>
      {xs.map((x, i) => {
        if (kind === "bowl")
          return (
            <group key={x} position={[x, 0.86, 0.3]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.15, 0.09, 0.1, 12]} />
                <meshStandardMaterial color={CREAM} />
              </mesh>
              <mesh position-y={0.04}>
                <cylinderGeometry args={[0.12, 0.12, 0.03, 12]} />
                <meshStandardMaterial color={i === 1 ? "#f3c35b" : accent} />
              </mesh>
            </group>
          );
        if (kind === "cup")
          return (
            <mesh key={x} position={[x, 0.9, 0.3]} castShadow>
              <cylinderGeometry args={[0.08, 0.06, 0.16, 10]} />
              <meshStandardMaterial color={i === 1 ? accent : CREAM} />
            </mesh>
          );
        if (kind === "box")
          return (
            <mesh key={x} position={[x, 0.91, 0.3]} rotation-y={i * 0.4} castShadow>
              <boxGeometry args={[0.2, 0.18, 0.2]} />
              <meshStandardMaterial color={i === 1 ? accent : ["#7cc3e8", "#f3c35b", "#f78fb3"][i]} />
            </mesh>
          );
        return (
          <mesh key={x} position={[x, 0.95, 0.3]} castShadow>
            <sphereGeometry args={[0.14, 8, 6]} />
            <meshStandardMaterial color={i === 1 ? accent : ["#ff8fb1", "#ffd166", "#8fcf7e"][i]} />
          </mesh>
        );
      })}
    </>
  );
}

function Plant({ wilted }: { wilted: boolean }) {
  return (
    <group position={[0.86, 0.1, -0.56]}>
      <mesh position-y={0.09} castShadow>
        <cylinderGeometry args={[0.1, 0.075, 0.18, 10]} />
        <meshStandardMaterial color="#c98b5e" />
      </mesh>
      {wilted ? (
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.07, 0.22, 0]} rotation-z={s * 1.0}>
            <coneGeometry args={[0.05, 0.22, 5]} />
            <meshStandardMaterial color={s < 0 ? "#98a85a" : "#7d8f45"} flatShading />
          </mesh>
        ))
      ) : (
        <>
          <mesh position-y={0.3} scale={[1, 1.2, 1]} castShadow>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial color="#6abf5e" />
          </mesh>
          <mesh position={[0.05, 0.44, 0.06]}>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshStandardMaterial color="#ff8fb1" />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Pembeli kecil (bentuk sama dengan warga desa, diperkecil), menghadap kios. */
function Customer({ position, shirt, hair }: { position: [number, number, number]; shirt: string; hair: string }) {
  return (
    <group position={position} rotation-y={Math.PI} scale={0.62}>
      <mesh position-y={0.6} castShadow>
        <capsuleGeometry args={[0.32, 0.42, 4, 10]} />
        <meshStandardMaterial color={shirt} />
      </mesh>
      <mesh position-y={1.24} castShadow>
        <sphereGeometry args={[0.34, 14, 12]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
      <mesh position-y={1.37} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[0.36, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={hair} />
      </mesh>
    </group>
  );
}
