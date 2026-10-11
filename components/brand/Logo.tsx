/**
 * Logo tepira village: "Pulau Koin". Rumah kecil dan pohon pinus di atas pulau yang tepinya koin emas,
 * jadi desamu tumbuh dari tabungan yang teu pira.
 *
 * Dua tingkat gambar (sama dengan public/brand/*.svg):
 * - size <= 48: versi kecil (rumah lebih besar, tanpa detail halus) yang tetap terbaca di 16-48 px.
 * - size > 48: versi lengkap (gerigi koin, kilau, cerobong, jendela, atap julang ngapak).
 * Hanya path tanpa id (tanpa gradient/clipPath), jadi aman dipasang berkali-kali di satu halaman.
 */

type Shape = { d: string; fill?: string; line?: string; w?: number; op?: number };

/** viewBox 0 0 64 64 */
const FULL: Shape[] = [
  { d: "M4 34.81 9.35 27.46 23.35 22.92 40.65 22.92 54.65 27.46 60 34.81 60 43.31 54.65 50.66 40.65 55.2 23.35 55.2 9.35 50.66 4 43.31z", fill: "#cc922c", w: 2.6 },
  { d: "M54.65 42.16 40.65 46.7 40.65 55.2 54.65 50.66z", fill: "#e3a93c", w: 0.4 },
  { d: "M40.65 46.7 23.35 46.7 23.35 55.2 40.65 55.2z", fill: "#f3c35b", w: 0.4 },
  { d: "M23.35 46.7 9.35 42.16 9.35 50.66 23.35 55.2z", fill: "#f3c35b", w: 0.4 },
  { d: "M9.35 42.16 4 34.81 4 43.31 9.35 50.66z", fill: "#f3c35b", w: 0.4 },
  { d: "M57.33 40.38 57.33 45.68M55.54 42.83 55.54 48.13M52.32 44.81 52.32 50.11M47.65 46.33 47.65 51.63M42.99 47.84 42.99 53.14M37.77 48.6 37.77 53.9M32 48.6 32 53.9M26.23 48.6 26.23 53.9M21.01 47.84 21.01 53.14M16.35 46.33 16.35 51.63M11.68 44.81 11.68 50.11M8.46 42.83 8.46 48.13M6.67 40.38 6.67 45.68", line: "#cc922c", w: 0.9, op: 0.6 },
  { d: "M60 34.81 54.65 42.16 40.65 46.7 23.35 46.7 9.35 42.16 4 34.81 9.35 27.46 23.35 22.92 40.65 22.92 54.65 27.46z", fill: "#f8d77f", w: 2.6 },
  { d: "M6 37.51 5.9 34.81 7.9 31.81", line: "#fff3c4", w: 1.6 },
  { d: "M56.64 34.41 51.93 40.88 39.61 44.87 24.39 44.87 12.07 40.88 7.36 34.41 12.07 27.94 24.39 23.95 39.61 23.95 51.93 27.94z", fill: "#6cc8ad", w: 2.6 },
  { d: "M12.5 41.81 28 41.81 42.5 38.01 45.7 39.61 31.2 43.41 14.78 43.41z", fill: "#5fbea2", w: 1.6 },
  { d: "M50 17.81 50 26.71", line: "#5a4a5e", w: 2.6 },
  { d: "M50 13.81 56.2 23.81 43.8 23.81z", fill: "#37957c", w: 2.6 },
  { d: "M50 13.81 50.74 23.81 43.8 23.81z", fill: "#4fb396", w: 2.6 },
  { d: "M50 8.81 54.8 17.81 45.2 17.81z", fill: "#37957c", w: 2.6 },
  { d: "M50 8.81 50.58 17.81 45.2 17.81z", fill: "#4fb396", w: 2.6 },
  { d: "M28 41.81 28 29.31 42.5 25.51 42.5 38.01z", fill: "#ffd3e4", w: 1.2 },
  { d: "M33.22 31.44 37.28 30.38 37.28 34.63 33.22 35.69z", fill: "#f3c35b", w: 1 },
  { d: "M11.5 41.81 11.5 29.31 19.75 19.81 28 29.31 28 41.81z", fill: "#fffaf7", w: 1.2 },
  { d: "M8.93 29.4 11.13 28.7 18.59 20.11", line: "#ff7eb3", w: 2.8 },
  { d: "M18.59 20.11 26.05 28.7 28.25 29.4 28.25 31 26.05 30.3 18.59 21.71z", fill: "#e8619c", w: 1.2 },
  { d: "M18.59 20.11 35.6 15.66 43.06 24.24 45.26 24.94 28.25 29.4 26.05 28.7z", fill: "#ff7eb3", w: 1.6 },
  { d: "M32.37 18.67 35.17 21.89 35.17 14.47 32.37 14.47z", fill: "#fffaf7", w: 0.8 },
  { d: "M35.17 21.89 37.49 21.28 37.49 13.86 35.17 14.47z", fill: "#ffd3e4", w: 0.8 },
  { d: "M32.37 14.47 35.17 14.47 37.49 13.86 34.69 13.86z", fill: "#5a4a5e", w: 0.8 },
  { d: "M17.25 42.21v-5.3a2.5 2.5 0 0 1 5 0v5.3z", fill: "#5a4a5e" }
];

/** Digambar di grid 64, ditampilkan di viewBox 0 0 32 32 (scale .5). */
const SMALL: Shape[] = [
  { d: "M2 44 7.73 37.53 22.73 33.54 41.27 33.54 56.27 37.53 62 44 62 52 56.27 58.47 41.27 62.46 22.73 62.46 7.73 58.47 2 52z", fill: "#cc922c", w: 2.6 },
  { d: "M56.27 50.47 41.27 54.46 41.27 62.46 56.27 58.47z", fill: "#e3a93c", w: 0.4 },
  { d: "M41.27 54.46 22.73 54.46 22.73 62.46 41.27 62.46z", fill: "#f3c35b", w: 0.4 },
  { d: "M22.73 54.46 7.73 50.47 7.73 58.47 22.73 62.46z", fill: "#f3c35b", w: 0.4 },
  { d: "M7.73 50.47 2 44 2 52 7.73 58.47z", fill: "#f3c35b", w: 0.4 },
  { d: "M62 44 56.27 50.47 41.27 54.46 22.73 54.46 7.73 50.47 2 44 7.73 37.53 22.73 33.54 41.27 33.54 56.27 37.53z", fill: "#f8d77f", w: 2.6 },
  { d: "M56.6 43.4 51.9 48.7 39.6 51.98 24.4 51.98 12.1 48.7 7.4 43.4 12.1 38.1 24.4 34.82 39.6 34.82 51.9 38.1z", fill: "#6cc8ad", w: 2.6 },
  { d: "M50 8 50 20.4", line: "#5a4a5e", w: 3.6 },
  { d: "M50 8 59.5 22 40.5 22z", fill: "#37957c", w: 2.6 },
  { d: "M50 8 51.14 22 40.5 22z", fill: "#4fb396", w: 2.6 },
  { d: "M50 1.5 57.5 14 42.5 14z", fill: "#37957c", w: 2.6 },
  { d: "M50 1.5 50.9 14 42.5 14z", fill: "#4fb396", w: 2.6 },
  { d: "M30 54 30 36 42 32.8 42 50.8z", fill: "#f6e3ea", w: 1.2 },
  { d: "M33.6 39.54 38.4 38.26 38.4 44.56 33.6 45.84z", fill: "#f3c35b", w: 1.2 },
  { d: "M6 54 6 36 18 24 30 36 30 54z", fill: "#fffaf7", w: 1.2 },
  { d: "M2.81 38.2 16.65 24.36", line: "#ff7eb3", w: 3.8 },
  { d: "M16.65 24.36 31.35 20.44 45.19 34.28 30.49 38.2z", fill: "#ff7eb3", w: 2.4 },
  { d: "M15.8 54.4v-7.8a2.2 2.2 0 0 1 4.4 0v7.8z", fill: "#5a4a5e" }
];

export function LogoMark({ size = 34, title, className }: { size?: number; title?: string; className?: string }) {
  const small = size <= 48;
  const shapes = small ? SMALL : FULL;
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true, focusable: false };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={small ? "0 0 32 32" : "0 0 64 64"}
      width={size}
      height={size}
      className={className}
      {...a11y}
    >
      {title && <title>{title}</title>}
      <g transform={small ? "scale(.5)" : undefined}>
        {shapes.map((s, i) =>
          s.line ? (
            <path
              key={i}
              d={s.d}
              fill="none"
              stroke={s.line}
              strokeWidth={s.w}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={s.op}
            />
          ) : (
            <path
              key={i}
              d={s.d}
              fill={s.fill}
              stroke={s.w ? s.fill : undefined}
              strokeWidth={s.w}
              strokeLinejoin={s.w ? "round" : undefined}
            />
          )
        )}
      </g>
    </svg>
  );
}
