"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HALL } from "../layout";
import { useVillage } from "../store";

/** Balai desa: rumah si penabung; memperlihatkan level desa dan skor kesehatan bulan ini. */
export default function Hall({ lit }: { lit: boolean }) {
  const setPanel = useVillage((s) => s.setPanel);
  const flag = useRef<THREE.Mesh>(null);
  const win = lit ? "#ffe8a3" : "#ffffff";


  useFrame((state) => {
    if (flag.current) flag.current.rotation.y = Math.sin(state.clock.elapsedTime * 2.6) * 0.3;
  });

  const tower = (x: number, z: number, h: number, r: number, key: string) => (
    <group key={key} position={[x, 0, z]}>
      <mesh position-y={h / 2 + 0.1} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, h, 12]} />
        <meshStandardMaterial color="#fbe3d3" />
      </mesh>
      <mesh position-y={h + 0.1 + r * 0.9} castShadow>
        <coneGeometry args={[r * 1.25, r * 1.9, 12]} />
        <meshStandardMaterial color="#6cc8ad" />
      </mesh>
      <mesh position={[0, h - 1.0, r + 0.02]}>
        <boxGeometry args={[0.4, 0.6, 0.05]} />
        <meshStandardMaterial color={win} emissive={win} emissiveIntensity={lit ? 0.9 : 0.05} />
      </mesh>
    </group>
  );

  return (
    <group
      position={[HALL.x, 0, HALL.z]}
      onClick={(e) => {
        e.stopPropagation();
        setPanel("month");
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh position-y={0.06} receiveShadow>
        <cylinderGeometry args={[4.4, 4.6, 0.12, 24]} />
        <meshStandardMaterial color="#f7f2e9" />
      </mesh>
      <mesh position-y={1.5} castShadow receiveShadow>
        <boxGeometry args={[4.4, 2.8, 3.2]} />
        <meshStandardMaterial color="#fff3e6" />
      </mesh>
      <mesh position-y={3.6} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[3.3, 1.8, 4]} />
        <meshStandardMaterial color="#6cc8ad" flatShading />
      </mesh>
      {tower(-2.2, 1.4, 3.6, 0.7, "l")}
      {tower(2.2, 1.4, 3.6, 0.7, "r")}
      {tower(0, -1.6, 5.2, 0.9, "back")}
      {/* pintu & jendela depan */}
      <mesh position={[0, 0.9, 1.63]}>
        <boxGeometry args={[1.2, 1.7, 0.1]} />
        <meshStandardMaterial color="#e39a6a" />
      </mesh>
      {[-1.3, 1.3].map((x) => (
        <mesh key={x} position={[x, 1.8, 1.63]}>
          <boxGeometry args={[0.6, 0.6, 0.08]} />
          <meshStandardMaterial color={win} emissive={win} emissiveIntensity={lit ? 0.9 : 0.05} />
        </mesh>
      ))}
      {/* bendera level */}
      <mesh position={[0, 7.4, -1.6]}>
        <cylinderGeometry args={[0.04, 0.04, 1.8, 6]} />
        <meshStandardMaterial color="#8b6b4f" />
      </mesh>
      <mesh ref={flag} position={[0.45, 8.0, -1.6]}>
        <boxGeometry args={[0.9, 0.55, 0.05]} />
        <meshStandardMaterial color="#ffd23f" />
      </mesh>

    </group>
  );
}
