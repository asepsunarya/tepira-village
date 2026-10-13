"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAILBOX_FRONT, POSTMAN_START } from "../layout";
import { useReducedMotion } from "../seasons";
import { useVillage } from "../store";
import { useMail } from "../useProgress";

/**
 * Pak Pos: datang dari pantai dekat dermaga setiap ada kiriman baru (tagihan rutin / catatan
 * otomatis), memasukkan amplop ke kotak pos, lalu menunggu di depan kotak pos selama masih ada tagihan
 * yang belum dicatat. Tagihan habis → pulang. "Kurangi gerakan": muncul/hilang tanpa berjalan.
 * Klik = buka 📮 Kotak pos. Seragam oranye polos (bukan logo layanan pos mana pun).
 */

type Phase = "hidden" | "in" | "deliver" | "wait" | "out";

interface Runtime {
  phase: Phase;
  x: number;
  z: number;
  yaw: number;
  t: number;
  timer: number;
  nonce: number;
}

const SPEED = 2.4;
const DELIVER_S = 2.2;
const SHIRT = "#f08a3c";
const NAVY = "#2f3a5e";
const SKIN = "#ffe3cf";

export default function Postman() {
  const nonce = useVillage((s) => s.postman?.nonce ?? 0);
  const delivered = useVillage((s) => s.mailDelivered);
  const deliverMail = useVillage((s) => s.deliverMail);
  const setPanel = useVillage((s) => s.setPanel);
  const { bills } = useMail();
  const reduced = useReducedMotion();
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const envelope = useRef<THREE.Mesh>(null);
  const rt = useRef<Runtime>({ phase: "hidden", x: POSTMAN_START.x, z: POSTMAN_START.z, yaw: 0, t: 0, timer: 0, nonce: 0 });

  // Kiriman baru: berjalan dari dermaga (atau dari tempatnya sekarang kalau sedang pulang).
  useEffect(() => {
    const r = rt.current;
    if (!nonce || nonce === r.nonce) return;
    r.nonce = nonce;
    if (reduced) {
      deliverMail();
      return;
    }
    if (r.phase === "wait" || r.phase === "deliver") {
      r.phase = "deliver";
      r.timer = DELIVER_S;
      deliverMail();
      return;
    }
    if (r.phase === "hidden") {
      r.x = POSTMAN_START.x;
      r.z = POSTMAN_START.z;
    }
    r.phase = "in";
  }, [nonce, reduced, deliverMail]);

  useFrame((_, delta) => {
    const r = rt.current;
    const dt = Math.min(delta, 0.05);
    r.t += dt;
    let moving = false;
    const walk = (tx: number, tz: number) => {
      const dx = tx - r.x;
      const dz = tz - r.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 0.08) return true;
      const step = Math.min(dist, SPEED * dt);
      r.x += (dx / dist) * step;
      r.z += (dz / dist) * step;
      let diff = Math.atan2(dx, dz) - r.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      r.yaw += diff * Math.min(1, dt * 8);
      moving = true;
      return false;
    };

    switch (r.phase) {
      case "hidden":
        // Halaman dibuka dan tagihan lama masih menunggu: Pak Pos sudah berdiri di depan kotak pos.
        if (bills > 0 && delivered) {
          r.phase = "wait";
          r.x = MAILBOX_FRONT.x;
          r.z = MAILBOX_FRONT.z;
          r.yaw = MAILBOX_FRONT.yaw;
        }
        break;
      case "in":
        if (walk(MAILBOX_FRONT.x, MAILBOX_FRONT.z)) {
          r.phase = "deliver";
          r.timer = DELIVER_S;
          r.yaw = MAILBOX_FRONT.yaw;
          deliverMail();
        }
        break;
      case "deliver":
        r.timer -= dt;
        if (r.timer <= 0) r.phase = bills > 0 ? "wait" : reduced ? "hidden" : "out";
        break;
      case "wait":
        if (bills === 0) r.phase = reduced ? "hidden" : "out";
        break;
      case "out":
        if (walk(POSTMAN_START.x, POSTMAN_START.z)) r.phase = "hidden";
        break;
    }

    const g = group.current;
    if (!g) return;
    g.visible = r.phase !== "hidden";
    const hop = r.phase === "deliver" ? Math.max(0, Math.sin((DELIVER_S - r.timer) * 6)) * 0.18 : 0;
    const bob = moving ? Math.abs(Math.sin(r.t * 10)) * 0.12 : 0;
    g.position.set(r.x, bob + hop, r.z);
    g.rotation.y = r.yaw;
    if (body.current) {
      // Menunggu: sesekali melambai kecil (badan bergoyang), berjalan: goyang langkah.
      body.current.rotation.z = moving ? Math.sin(r.t * 10) * 0.08 : r.phase === "wait" ? Math.sin(r.t * 1.6) * 0.04 : 0;
    }
    if (envelope.current) envelope.current.visible = r.phase === "in";
  });

  return (
    <group
      ref={group}
      visible={false}
      scale={0.85}
      onClick={(e) => {
        e.stopPropagation();
        setPanel("letter");
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <group ref={body}>
        <mesh position-y={0.6} castShadow>
          <capsuleGeometry args={[0.32, 0.42, 4, 10]} />
          <meshStandardMaterial color={SHIRT} />
        </mesh>
        <mesh position-y={1.24} castShadow>
          <sphereGeometry args={[0.34, 14, 12]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        {/* topi: mahkota + pinggiran depan */}
        <mesh position-y={1.5} castShadow>
          <cylinderGeometry args={[0.3, 0.34, 0.2, 14]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
        <mesh position={[0, 1.42, 0.26]} rotation-x={0.25}>
          <boxGeometry args={[0.34, 0.03, 0.2]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
        {[-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, 1.26, 0.3]}>
            <sphereGeometry args={[0.045, 6, 6]} />
            <meshStandardMaterial color="#3a2b2b" />
          </mesh>
        ))}
        {/* tas selempang + talinya */}
        <mesh position={[0.36, 0.55, 0.05]} castShadow>
          <boxGeometry args={[0.16, 0.34, 0.4]} />
          <meshStandardMaterial color="#8a5a3a" />
        </mesh>
        <mesh position={[0.05, 0.9, 0.02]} rotation-z={0.75}>
          <boxGeometry args={[0.05, 0.85, 0.05]} />
          <meshStandardMaterial color="#6b4430" />
        </mesh>
        {/* amplop di tangan saat mengantar */}
        <mesh ref={envelope} position={[-0.38, 0.75, 0.22]} rotation-z={0.3} visible={false}>
          <boxGeometry args={[0.26, 0.18, 0.03]} />
          <meshStandardMaterial color="#e9c46a" emissive="#fff3d6" emissiveIntensity={0.2} />
        </mesh>
      </group>
    </group>
  );
}
