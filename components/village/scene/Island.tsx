"use client";

import { useMemo } from "react";
import { makeIslandGeometry } from "./geometry";
import { POND, SEA_Y } from "../layout";

export default function Island({ sea }: { sea: string }) {
  const geometry = useMemo(makeIslandGeometry, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={SEA_Y} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color={sea} />
      </mesh>

      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial attach="material-0" color="#a6dc78" />
        <meshStandardMaterial attach="material-1" color="#f3d6c2" />
      </mesh>

      <group position={[POND.x, 0.03, POND.z]}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.0} scale={[POND.rx + 0.6, POND.rz + 0.6, 1]}>
          <circleGeometry args={[1, 48]} />
          <meshStandardMaterial color="#e9d9b5" />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.02} scale={[POND.rx, POND.rz, 1]}>
          <circleGeometry args={[1, 48]} />
          <meshStandardMaterial color="#8fd3f4" />
        </mesh>
        {[
          [-1.6, 0.6],
          [1.2, -0.9],
          [0.4, 1.4]
        ].map(([x, z], i) => (
          <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.05, z]}>
            <circleGeometry args={[0.45, 16]} />
            <meshStandardMaterial color="#6cc06c" />
          </mesh>
        ))}
      </group>
    </group>
  );
}
