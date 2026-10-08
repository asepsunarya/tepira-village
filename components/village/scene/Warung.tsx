"use client";

import { WARUNG } from "../layout";
import { useVillage } from "../store";

/** Warung: tempat semua pengeluaran "terjadi". Menampilkan total bulan ini & status budget. */
export default function Warung({ lit }: { lit: boolean }) {
  const setPanel = useVillage((s) => s.setPanel);
  const body = "#ffe6d6";
  const roof = "#f0a06a";
  const h = 2.1;
  const win = lit ? "#ffe8a3" : "#cfe9ff";

  return (
    <group
      position={[WARUNG.x, 0, WARUNG.z]}
      rotation-y={-0.6}
      onClick={(e) => {
        e.stopPropagation();
        setPanel("spend");
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh position-y={0.05} receiveShadow>
        <boxGeometry args={[5.6, 0.1, 5.6]} />
        <meshStandardMaterial color="#f7f2e9" />
      </mesh>
      <mesh position-y={h / 2 + 0.1} castShadow receiveShadow>
        <boxGeometry args={[3.2, h, 2.6]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <group position-y={h + 0.1}>
        <mesh position-y={0.25} castShadow>
          <boxGeometry args={[3.8, 0.5, 3.2]} />
          <meshStandardMaterial color={roof} />
        </mesh>
        <mesh position={[0, 0.75, 0]} castShadow>
          <boxGeometry args={[2.4, 0.5, 2]} />
          <meshStandardMaterial color={body} />
        </mesh>
        <mesh position={[0, 1.15, 0]} castShadow>
          <boxGeometry args={[2.8, 0.3, 2.4]} />
          <meshStandardMaterial color={roof} />
        </mesh>
        {/* kanopi bergaris */}
        {[-1.2, -0.6, 0, 0.6, 1.2].map((x, i) => (
          <mesh key={x} position={[x, -0.8, 1.6]} rotation-x={0.35} castShadow>
            <boxGeometry args={[0.6, 0.12, 1.0]} />
            <meshStandardMaterial color={i % 2 ? "#fff6ee" : roof} />
          </mesh>
        ))}
      </group>
      {/* etalase */}
      <mesh position={[0, 0.75, 1.32]}>
        <boxGeometry args={[2.2, 0.9, 0.1]} />
        <meshStandardMaterial color={win} emissive={win} emissiveIntensity={lit ? 0.7 : 0.05} />
      </mesh>
      <mesh position={[0, 0.3, 1.45]} castShadow>
        <boxGeometry args={[2.6, 0.5, 0.5]} />
        <meshStandardMaterial color="#c99a66" />
      </mesh>
      {/* barang dagangan */}
      {[-0.8, -0.3, 0.2, 0.7].map((x, i) => (
        <mesh key={x} position={[x, 0.68, 1.45]} castShadow>
          <sphereGeometry args={[0.16, 8, 6]} />
          <meshStandardMaterial color={["#ff6b6b", "#ffd166", "#8fcf7e", "#f78fb3"][i]} />
        </mesh>
      ))}

    </group>
  );
}
