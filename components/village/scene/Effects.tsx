"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Awan lembut yang melayang pelan di atas pulau. */
export function Clouds({ count = 6, tint = "#ffffff", opacity = 0.9 }: { count?: number; tint?: string; opacity?: number }) {
  const group = useRef<THREE.Group>(null);
  const seeds = useRef(
    Array.from({ length: count }, (_, i) => ({
      x: -30 + (i / count) * 60 + Math.random() * 6,
      y: 14 + Math.random() * 5,
      z: -22 + Math.random() * 44,
      s: 1.4 + Math.random() * 1.4,
      speed: 0.25 + Math.random() * 0.35
    }))
  );
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      c.position.x += seeds.current[i].speed * delta;
      if (c.position.x > 38) c.position.x = -38;
    });
  });
  return (
    <group ref={group}>
      {seeds.current.map((s, i) => (
        <group key={i} position={[s.x, s.y, s.z]} scale={s.s}>
          {[
            [0, 0, 0, 1.1],
            [1.1, 0.2, 0.2, 0.85],
            [-1.0, 0.1, -0.1, 0.8],
            [0.3, 0.5, -0.3, 0.7]
          ].map(([x, y, z, r], j) => (
            <mesh key={j} position={[x, y, z]}>
              <sphereGeometry args={[r, 10, 8]} />
              <meshStandardMaterial color={tint} transparent opacity={opacity} flatShading />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
