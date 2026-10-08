"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HALL, POND, WALLET_ROW } from "../layout";
import { useVillage } from "../store";
import { insideIsland } from "./geometry";
import { labelRegistry } from "./labels";

interface Runtime {
  x: number;
  z: number;
  tx: number;
  tz: number;
  wait: number;
  yaw: number;
  t: number;
  arrived: boolean;
  mode: "wander" | "errand";
  errandKind: "save" | "spend" | "idle";
  celebrate: number;
  lastNonce: number;
}

const SPEED = 2.6;

function randomWanderTarget(): [number, number] {
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() * 2 - 1) * 20;
    const z = (Math.random() * 2 - 1) * 15;
    const inPond = Math.hypot((POND.x - x) / (POND.rx + 1), (POND.z - z) / (POND.rz + 1)) < 1;
    const inWallets = z < WALLET_ROW.z + 2.5;
    if (insideIsland(x, z, 0.8) && !inPond && !inWallets) return [x, z];
  }
  return [0, 4];
}

/** Si penabung: berjalan-jalan di desa, bergegas ke goal saat nabung dan ke warung saat belanja. */
export default function Villager() {
  const target = useVillage((s) => s.villagerTarget);
  const setPanel = useVillage((s) => s.setPanel);

  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const rt = useRef<Runtime | null>(null);
  if (!rt.current) {
    const [tx, tz] = randomWanderTarget();
    rt.current = {
      x: HALL.x,
      z: HALL.z + 3.2,
      tx,
      tz,
      wait: 1,
      yaw: 0,
      t: 0,
      arrived: false,
      mode: "wander",
      errandKind: "idle",
      celebrate: 0,
      lastNonce: 0
    };
  }

  useEffect(() => {
    const r = rt.current!;
    if (!target || target.nonce === r.lastNonce) return;
    r.lastNonce = target.nonce;
    r.mode = "errand";
    r.errandKind = target.kind;
    r.tx = target.x;
    r.tz = target.z;
    r.wait = 0;
    r.arrived = false;
  }, [target]);


  useFrame((_, delta) => {
    const r = rt.current!;
    const dt = Math.min(delta, 0.05);
    r.t += dt;
    if (r.celebrate > 0) r.celebrate -= dt;

    if (r.wait > 0) {
      r.wait -= dt;
    } else if (r.arrived) {
      const [tx, tz] = randomWanderTarget();
      r.tx = tx;
      r.tz = tz;
      r.arrived = false;
      r.mode = "wander";
    }

    const dx = r.tx - r.x;
    const dz = r.tz - r.z;
    const dist = Math.hypot(dx, dz);
    const speed = r.mode === "errand" ? SPEED * 1.8 : SPEED;
    let moving = false;
    if (dist > 0.12) {
      moving = true;
      const step = Math.min(dist, speed * dt);
      r.x += (dx / dist) * step;
      r.z += (dz / dist) * step;
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - r.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      r.yaw += diff * Math.min(1, dt * 8);
    } else if (!r.arrived) {
      r.arrived = true;
      if (r.mode === "errand") {
        r.wait = 3.2;
        r.yaw = Math.PI; // menghadap bangunan
        if (r.errandKind === "save") r.celebrate = 2.4;
      } else {
        r.wait = 1.5 + Math.random() * 3.5;
      }
    }

    const g = group.current;
    if (!g) return;
    const hop = r.celebrate > 0 ? Math.abs(Math.sin(r.t * 9)) * 0.45 : 0;
    const bob = moving ? Math.abs(Math.sin(r.t * 11)) * 0.14 : 0;
    g.position.set(r.x, bob + hop, r.z);
    const label = labelRegistry.get("villager");
    if (label) label.pos.set(r.x, bob + hop - 0.15, r.z);
    g.rotation.y = r.yaw;
    if (body.current) {
      body.current.rotation.z = moving ? Math.sin(r.t * 11) * 0.08 : 0;
      const squash = r.celebrate > 0 ? 1 + Math.sin(r.t * 9) * 0.06 : 1;
      body.current.scale.set(1 / squash, squash, 1 / squash);
    }
  });

  const shirt = "#f28cb4";
  const skin = "#ffe3cf";
  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation();
        setPanel("month");
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <group ref={body}>
        <mesh position-y={0.62} castShadow>
          <capsuleGeometry args={[0.34, 0.45, 4, 10]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh position-y={1.28} castShadow>
          <sphereGeometry args={[0.36, 14, 12]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <mesh position-y={1.42} scale={[1, 0.7, 1]} castShadow>
          <sphereGeometry args={[0.38, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#5a4a5e" />
        </mesh>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 1.3, 0.31]}>
            <sphereGeometry args={[0.05, 6, 6]} />
            <meshStandardMaterial color="#3a2b2b" />
          </mesh>
        ))}
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 1.2, 0.27]}>
            <sphereGeometry args={[0.06, 6, 6]} />
            <meshStandardMaterial color="#ffb0c0" />
          </mesh>
        ))}
        {/* celengan kecil di tangan */}
        <mesh position={[0.42, 0.65, 0.2]} castShadow>
          <sphereGeometry args={[0.16, 10, 8]} />
          <meshStandardMaterial color="#ff9fc2" />
        </mesh>
      </group>

    </group>
  );
}
