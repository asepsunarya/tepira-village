"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WalletView } from "@/lib/game";
import { walletSpot } from "../layout";
import { useVillage } from "../store";

const TYPE_COLORS: Record<string, { body: string; trim: string }> = {
  bank: { body: "#8ab6f0", trim: "#f3c35b" },
  "e-wallet": { body: "#6cc8ad", trim: "#f3c35b" },
  cash: { body: "#9bd27a", trim: "#f3c35b" },
  investment: { body: "#b391f0", trim: "#f3c35b" },
  credit: { body: "#8a4a5c", trim: "#5a3540" },
  paylater: { body: "#8a4a5c", trim: "#5a3540" },
  other: { body: "#e0b48c", trim: "#f3c35b" }
};

/**
 * Peti dompet. Ukuran mengikuti porsi saldo terhadap total aset (log scale
 * supaya dompet kecil tetap terlihat). Dompet utang tampil gelap dengan
 * cincin merah.
 */
export default function WalletChest({
  wallet,
  index,
  share
}: {
  wallet: WalletView;
  index: number;
  share: number;
}) {
  const spot = walletSpot(index);
  const colors = wallet.isDebt ? TYPE_COLORS.credit : TYPE_COLORS[wallet.type] ?? TYPE_COLORS.other;
  const selected = useVillage((s) => s.selectedWalletId === wallet.id && s.panel === "wallets");
  const openWallet = useVillage((s) => s.openWallet);
  const lid = useRef<THREE.Group>(null);
  const coins = useRef<THREE.Group>(null);

  const scale = 0.85 + Math.min(0.75, Math.log1p(share * 9) * 0.45);
  const empty = wallet.balance <= 0 && !wallet.isDebt;

  useFrame((state) => {
    const t = state.clock.elapsedTime + index;
    if (lid.current) lid.current.rotation.x = selected ? -0.9 : -0.12 - Math.sin(t * 1.4) * 0.06;
    if (coins.current) coins.current.position.y = 0.55 + Math.sin(t * 2) * 0.03;
  });

  return (
    <group
      position={[spot.x, 0, spot.z]}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        openWallet(wallet.id);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh position-y={0.04} receiveShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.08, 20]} />
        <meshStandardMaterial color="#f7f2e9" />
      </mesh>
      {(selected || wallet.isDebt) && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.1}>
          <ringGeometry args={[1.55, 1.75, 40]} />
          <meshBasicMaterial color={selected ? "#ff7eb3" : "#e86d6d"} />
        </mesh>
      )}
      {/* badan peti */}
      <mesh position-y={0.5} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.9, 1.2]} />
        <meshStandardMaterial color={colors.body} />
      </mesh>
      <mesh position={[0, 0.5, 0.61]}>
        <boxGeometry args={[0.3, 0.4, 0.05]} />
        <meshStandardMaterial color={colors.trim} />
      </mesh>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.5, 0]}>
          <boxGeometry args={[0.12, 0.95, 1.25]} />
          <meshStandardMaterial color={colors.trim} />
        </mesh>
      ))}
      {/* koin di dalam */}
      {!empty && !wallet.isDebt && (
        <group ref={coins}>
          {[-0.4, 0, 0.4].map((x, i) => (
            <mesh key={i} position={[x, 0.45 + (i % 2) * 0.12, (i - 1) * 0.2]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.22, 0.22, 0.08, 12]} />
              <meshStandardMaterial color="#ffd23f" emissive="#ffb800" emissiveIntensity={0.35} />
            </mesh>
          ))}
        </group>
      )}
      {/* tutup (berputar di engsel belakang) */}
      <group ref={lid} position={[0, 0.95, -0.6]}>
        <mesh position={[0, 0.2, 0.6]} castShadow>
          <boxGeometry args={[1.84, 0.4, 1.24]} />
          <meshStandardMaterial color={colors.body} />
        </mesh>
        <mesh position={[0, 0.42, 0.6]} castShadow>
          <boxGeometry args={[1.84, 0.1, 1.24]} />
          <meshStandardMaterial color={colors.trim} />
        </mesh>
      </group>

    </group>
  );
}
