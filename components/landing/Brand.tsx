import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";

/** Logo Pulau Koin + nama, sama seperti di HUD desa. */
export default function Brand({ href = "/", label = "tepira village, ke beranda" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="hud-brand lp-brand" aria-label={label}>
      <LogoMark size={42} className="brand-dot" />
      <span className="lp-brand-text">
        <b>tepira</b> village
        <small>desa tabunganmu</small>
      </span>
    </Link>
  );
}
