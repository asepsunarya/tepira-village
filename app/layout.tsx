import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800", "900"], display: "swap" });

/** Alamat produksi untuk URL absolut og:image. Sama seperti bawaan Next di Vercel, bisa ditimpa NEXT_PUBLIC_SITE_URL. */
function siteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  try {
    return new URL(new URL(raw).origin);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "tepira village – desa tabunganmu",
  description:
    "Versi interaktif tepira.id: setiap goal tabungan jadi bangunan yang tumbuh tiap kamu menyetor. Data sama dengan tepira.id.",
  // Logo Pulau Koin. Browser modern memakai SVG; .ico (16/32/48) untuk yang lama. sizes="32x32" di .ico
  // supaya Chrome tetap memilih SVG. Ikon PWA 192/512 ada di app/manifest.ts.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" }
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" }
  },
  openGraph: {
    title: "tepira village – desa tabunganmu",
    description: "Nabung dari hal yang teu pira, lihat desamu tumbuh.",
    locale: "id_ID",
    type: "website",
    // Poster desa contoh (tanpa nama asli).
    images: [{ url: "/landing/village-poster.png", width: 780, height: 650, alt: "Pulau desa tepira contoh" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "tepira village – desa tabunganmu",
    description: "Nabung dari hal yang teu pira, lihat desamu tumbuh.",
    images: ["/landing/village-poster.png"]
  }
};

// maximumScale: 1 hanya untuk /village (lihat app/village/page.tsx); landing & login tetap bisa di-zoom.
export const viewport: Viewport = {
  themeColor: "#cfe9f7",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={nunito.className}>
      <body>{children}</body>
    </html>
  );
}
