import Link from "next/link";

/** Logo "t" + nama, sama seperti di HUD desa. */
export default function Brand({ href = "/", label = "tepira village, ke beranda" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="hud-brand lp-brand" aria-label={label}>
      <span className="brand-dot" aria-hidden="true">t</span>
      <span className="lp-brand-text">
        <b>tepira</b> village
        <small>desa tabunganmu</small>
      </span>
    </Link>
  );
}
