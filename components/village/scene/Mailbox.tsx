"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAILBOX } from "../layout";
import { useVillage } from "../store";
import { useMail } from "../useProgress";

/**
 * Kotak pos Balai Desa: benderanya naik selama ada kiriman. Surat putih = surat minggu ini (insight
 * tepira atau pratinjaunya) belum dibuka; amplop cokelat = tagihan rutin menunggu dicatat (muncul
 * setelah Pak Pos tiba).
 */
export default function Mailbox() {
  const setPanel = useVillage((s) => s.setPanel);
  const { unread, bills } = useMail();
  const delivered = useVillage((s) => s.mailDelivered);
  const hasBills = bills > 0 && delivered;
  const flag = useRef<THREE.Group>(null);
  const letter = useRef<THREE.Mesh>(null);
  const bill = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (flag.current) {
      // naik = tegak, turun = rebah ke belakang
      const target = unread || hasBills ? 0 : -Math.PI / 2;
      flag.current.rotation.x += (target - flag.current.rotation.x) * Math.min(1, delta * 5);
    }
    if (letter.current) {
      letter.current.visible = unread;
      letter.current.rotation.z = Math.sin(state.clock.elapsedTime * 4) * 0.08;
    }
    if (bill.current) {
      bill.current.visible = hasBills;
      bill.current.rotation.z = -0.12 + Math.sin(state.clock.elapsedTime * 3.2 + 1) * 0.06;
    }
  });

  return (
    <group
      position={[MAILBOX.x, 0, MAILBOX.z]}
      rotation-y={MAILBOX.rot}
      onClick={(e) => {
        e.stopPropagation();
        setPanel("letter");
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh position-y={0.5} castShadow>
        <boxGeometry args={[0.14, 1.0, 0.14]} />
        <meshStandardMaterial color="#a97a52" />
      </mesh>
      <mesh position-y={1.15} castShadow>
        <boxGeometry args={[0.56, 0.42, 0.8]} />
        <meshStandardMaterial color="#f0a06a" />
      </mesh>
      {/* atap melengkung: setengah silinder di atas badan kotak */}
      <mesh position-y={1.36} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.8, 12, 1, false, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#f0a06a" side={THREE.DoubleSide} />
      </mesh>
      {/* muka depan & lubang surat */}
      <mesh position={[0, 1.2, 0.41]}>
        <boxGeometry args={[0.5, 0.5, 0.02]} />
        <meshStandardMaterial color="#e08f5a" />
      </mesh>
      <mesh position={[0, 1.28, 0.425]}>
        <boxGeometry args={[0.32, 0.05, 0.02]} />
        <meshStandardMaterial color="#5a4a5e" />
      </mesh>
      <mesh ref={letter} position={[0, 1.36, 0.45]}>
        <boxGeometry args={[0.3, 0.2, 0.03]} />
        <meshStandardMaterial color="#ffffff" emissive="#fff3d6" emissiveIntensity={0.3} />
      </mesh>
      <mesh ref={bill} position={[0.06, 1.33, 0.46]}>
        <boxGeometry args={[0.3, 0.2, 0.03]} />
        <meshStandardMaterial color="#e9c46a" emissive="#fff3d6" emissiveIntensity={0.2} />
      </mesh>
      <group ref={flag} position={[0.3, 1.05, 0.12]}>
        <mesh position-y={0.25}>
          <boxGeometry args={[0.04, 0.5, 0.04]} />
          <meshStandardMaterial color="#5a4a5e" />
        </mesh>
        <mesh position={[0, 0.44, -0.11]}>
          <boxGeometry args={[0.04, 0.16, 0.22]} />
          <meshStandardMaterial color="#e86d6d" />
        </mesh>
      </group>
    </group>
  );
}
