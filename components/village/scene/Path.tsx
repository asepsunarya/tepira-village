"use client";

import { useMemo } from "react";
import { pathCurve } from "./geometry";
import { TILE_COLORS } from "../layout";

export default function Path() {
  const tiles = useMemo(() => {
    const n = 64;
    const pts = pathCurve.getSpacedPoints(n);
    return pts.map((p, i) => {
      const tan = pathCurve.getTangentAt(i / n);
      return { x: p.x, z: p.z, yaw: Math.atan2(tan.x, tan.z), color: TILE_COLORS[i % TILE_COLORS.length] };
    });
  }, []);
  return (
    <group>
      {tiles.map((t, i) => (
        <mesh key={i} position={[t.x, 0.1, t.z]} rotation-y={t.yaw} receiveShadow castShadow>
          <boxGeometry args={[1.25, 0.2, 1.1]} />
          <meshStandardMaterial color={t.color} />
        </mesh>
      ))}
    </group>
  );
}
