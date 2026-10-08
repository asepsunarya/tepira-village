import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800", "900"], display: "swap" });

export const metadata: Metadata = {
  title: "tepira village – desa tabunganmu",
  description:
    "Versi interaktif tepira.id: setiap goal tabungan jadi bangunan yang tumbuh tiap kamu menyetor. Data sama dengan tepira.id.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "tepira village – desa tabunganmu",
    description: "Nabung dari hal yang teu pira, lihat desamu tumbuh.",
    locale: "id_ID",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#cfe9f7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={nunito.className}>
      <body>{children}</body>
    </html>
  );
}
