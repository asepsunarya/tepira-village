import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  LightSpecification,
  SkySpecification,
  StyleSpecification
} from "maplibre-gl";

/**
 * Gaya peta "desa": peta dasar dari data vektor OpenStreetMap (OpenFreeMap, skema OpenMapTiles)
 * yang diwarnai sendiri supaya terasa seperti peta game yang senada dengan pulau tepira-village:
 * daratan rumput, pantai berpasir di tepi air, jalan seperti setapak, gedung balok pastel, dan label
 * tebal berbingkai krem. Tiga suasana mengikuti cuaca desa: siang, senja, malam.
 */

export type MapTheme = "siang" | "senja" | "malam";

interface Palette {
  land: string;
  residential: string;
  commercial: string;
  industrial: string;
  civic: string;
  park: string;
  wood: string;
  farmland: string;
  sand: string;
  water: string;
  /** cincin pasir di sekeliling air */
  shore: string;
  /** garis buih tipis di tepi air */
  foam: string;
  minor: string;
  minorEdge: string;
  /** jalan sekunder/tersier: lebih pucat supaya jaringan jalan tidak terlalu ramai */
  street: string;
  streetEdge: string;
  major: string;
  majorEdge: string;
  highway: string;
  highwayEdge: string;
  path: string;
  rail: string;
  runway: string;
  boundary: string;
  buildingFlat: string;
  /**
   * Dinding & atap gedung menurut tinggi [rumah, gedung sedang, menara], seperti rumah di desa:
   * badan pucat dengan atap berwarna (rumah beratap terakota, menara berkaca biru).
   */
  walls: readonly [string, string, string];
  roofs: readonly [string, string, string];
  text: string;
  halo: string;
  textSoft: string;
  waterText: string;
  waterHalo: string;
  sky: string;
  horizon: string;
  fog: string;
  light: { color: string; intensity: number };
}

export const PALETTES: Record<MapTheme, Palette> = {
  siang: {
    land: "#d6edbb",
    residential: "#e2f2cc",
    commercial: "#f6ead6",
    industrial: "#ebe5f1",
    civic: "#f9eae9",
    park: "#b4df8f",
    wood: "#a3d585",
    farmland: "#e3f0c2",
    sand: "#fbe8c3",
    water: "#9ad4ee",
    shore: "#fbeccb",
    foam: "#d8f3ff",
    minor: "#fffdf6",
    minorEdge: "#bcdba0",
    street: "#fff8e4",
    streetEdge: "#e6d3a6",
    major: "#ffe7a8",
    majorEdge: "#e9c377",
    highway: "#ffcfb6",
    highwayEdge: "#ec9f86",
    path: "#fff6e3",
    rail: "#c3b2d4",
    runway: "#e9e1ee",
    boundary: "#b39bc4",
    buildingFlat: "#f2e3d6",
    walls: ["#fff4df", "#ffe6ee", "#e4f3ff"],
    roofs: ["#f8d4b8", "#f6c4d7", "#bddcf2"],
    text: "#5a4a5e",
    halo: "#fffaf2",
    textSoft: "#7d6c80",
    waterText: "#3f7fae",
    waterHalo: "#e3f6ff",
    sky: "#cfe9f7",
    horizon: "#fff3e6",
    fog: "#eaf5fb",
    light: { color: "#fff8ee", intensity: 0.22 }
  },
  senja: {
    land: "#efdcbf",
    residential: "#f3e2c8",
    commercial: "#f7dccb",
    industrial: "#e6d6e3",
    civic: "#f8d7d8",
    park: "#d0cf90",
    wood: "#bfc583",
    farmland: "#efe2b8",
    sand: "#fbdcb4",
    water: "#efbfb2",
    shore: "#fde4c4",
    foam: "#ffd9cc",
    minor: "#fff3e6",
    minorEdge: "#d8b995",
    street: "#fff1df",
    streetEdge: "#dfbf98",
    major: "#ffd49a",
    majorEdge: "#e2a465",
    highway: "#ffb89d",
    highwayEdge: "#d98570",
    path: "#fff0de",
    rail: "#c9a9c4",
    runway: "#ecd9dc",
    boundary: "#c08fae",
    buildingFlat: "#f4d7c6",
    walls: ["#ffe9d4", "#ffdce2", "#f0e2f4"],
    roofs: ["#eeb5a6", "#e9a3ba", "#c9b2e2"],
    text: "#5a3f52",
    halo: "#fff1e6",
    textSoft: "#82657a",
    waterText: "#a5574f",
    waterHalo: "#ffeae2",
    sky: "#f6c7b0",
    horizon: "#ffd1b8",
    fog: "#f8dac6",
    light: { color: "#ffe2c4", intensity: 0.3 }
  },
  malam: {
    land: "#363b6b",
    residential: "#3b4072",
    commercial: "#433f72",
    industrial: "#3a3a66",
    civic: "#47406f",
    park: "#2f5163",
    wood: "#2b4a5c",
    farmland: "#38446c",
    sand: "#4b4a72",
    water: "#27305a",
    shore: "#4d4c7c",
    foam: "#4a5aa0",
    minor: "#5a5f96",
    minorEdge: "#2c3059",
    street: "#6b6aa0",
    streetEdge: "#2e325c",
    major: "#d9b467",
    majorEdge: "#5b4c5e",
    highway: "#e9a36e",
    highwayEdge: "#634660",
    path: "#4e5389",
    rail: "#6d6a9e",
    runway: "#454a7a",
    boundary: "#8a7fc0",
    buildingFlat: "#4a5088",
    walls: ["#525896", "#5a5697", "#4d5b91"],
    roofs: ["#8a78b8", "#9a6f9f", "#6a8fc0"],
    text: "#fff3e6",
    halo: "#2c2f55",
    textSoft: "#d9cfee",
    waterText: "#a9b8f0",
    waterHalo: "#1e2447",
    sky: "#2c2f55",
    horizon: "#4a4f86",
    fog: "#3a3f70",
    light: { color: "#c9cdf6", intensity: 0.25 }
  }
};

const SOURCE = "openmaptiles";
/** Font yang tersedia di server glyph OpenFreeMap. */
const FONT_BOLD = ["Noto Sans Bold"];
const FONT_REGULAR = ["Noto Sans Regular"];
const FONT_ITALIC = ["Noto Sans Italic"];

/** Nama berbahasa Indonesia bila ada ("Malaysia", "Laut Jawa"), lalu nama latin, lalu nama asli. */
const NAME: ExpressionSpecification = ["coalesce", ["get", "name:id"], ["get", "name:latin"], ["get", "name"]];

const byClass = (...classes: string[]): ExpressionSpecification => ["match", ["get", "class"], classes, true, false];
const notTunnel: ExpressionSpecification = ["!=", ["get", "brunnel"], "tunnel"];
const isLine: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];

/** Lebar garis jalan per zoom: [zoom, lebar] berpasangan, bertambah eksponensial seperti peta biasa. */
const width = (...stops: number[]): ExpressionSpecification =>
  ["interpolate", ["exponential", 1.4], ["zoom"], ...stops] as ExpressionSpecification;

/** Gedung pencakar langit dipotong supaya tetap terasa seperti mainan, bukan menara raksasa. */
const MAX_HEIGHT = 140;
const WALL_TOP: ExpressionSpecification = ["min", ["coalesce", ["get", "render_height"], 4], MAX_HEIGHT];

/** Lebar sungai/kanal vs. selokan kecil di satu titik zoom. */
const riverOr = (river: number, stream: number): ExpressionSpecification => [
  "match",
  ["get", "class"],
  ["river", "canal"],
  river,
  stream
];

/**
 * Warna gedung menurut tingginya. Tidak bisa per gedung: ubin OpenFreeMap menggabungkan gedung
 * yang berdempetan jadi satu fitur, jadi warna acak per fitur malah menjadi petak-petak besar.
 */
const buildingColor = ([house, mid, tower]: readonly [string, string, string]): ExpressionSpecification => [
  "step",
  WALL_TOP,
  house,
  12,
  mid,
  30,
  tower
];

interface RoadKind {
  id: string;
  filter: ExpressionSpecification;
  minzoom: number;
  fill: (p: Palette) => string;
  edge: (p: Palette) => string;
  /** lebar isi jalan per zoom; tepi = isi + 2–3 px */
  widths: number[];
}

const ROADS: RoadKind[] = [
  {
    id: "service",
    filter: byClass("service", "track"),
    minzoom: 14,
    fill: (p) => p.minor,
    edge: (p) => p.minorEdge,
    widths: [14, 1, 18, 8]
  },
  {
    id: "minor",
    filter: byClass("minor"),
    minzoom: 12,
    fill: (p) => p.minor,
    edge: (p) => p.minorEdge,
    widths: [12, 0.6, 14, 2.4, 18, 14]
  },
  {
    id: "secondary",
    filter: byClass("secondary", "tertiary"),
    minzoom: 9,
    fill: (p) => p.street,
    edge: (p) => p.streetEdge,
    widths: [9, 0.6, 12, 2.2, 14, 4, 18, 20]
  },
  {
    id: "primary",
    filter: byClass("primary", "trunk"),
    minzoom: 6,
    fill: (p) => p.major,
    edge: (p) => p.majorEdge,
    widths: [6, 0.5, 10, 2, 14, 5.5, 18, 24]
  },
  {
    id: "motorway",
    filter: byClass("motorway"),
    minzoom: 5,
    fill: (p) => p.highway,
    edge: (p) => p.highwayEdge,
    widths: [5, 0.6, 10, 2.4, 14, 6, 18, 26]
  }
];

function roadLayers(p: Palette): LayerSpecification[] {
  const base = (r: RoadKind) =>
    ({
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      minzoom: r.minzoom,
      filter: ["all", isLine, notTunnel, r.filter] as FilterSpecification,
      layout: { "line-cap": "round", "line-join": "round" }
    }) as const;
  // Semua tepi dulu, baru semua isi: persimpangan jalan menyatu tanpa garis tepi memotong.
  const edges = ROADS.map(
    (r): LayerSpecification => ({
      ...base(r),
      id: `road-${r.id}-edge`,
      paint: {
        "line-color": r.edge(p),
        "line-width": width(...r.widths.map((v, i) => (i % 2 ? v + (v < 2 ? 1.2 : 3) : v)))
      }
    })
  );
  const fills = ROADS.map(
    (r): LayerSpecification => ({
      ...base(r),
      id: `road-${r.id}`,
      paint: { "line-color": r.fill(p), "line-width": width(...r.widths) }
    })
  );
  return [...edges, ...fills];
}

function layers(p: Palette): LayerSpecification[] {
  return [
    { id: "land", type: "background", paint: { "background-color": p.land } },
    {
      id: "landcover-farmland",
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      filter: byClass("farmland"),
      paint: { "fill-color": p.farmland }
    },
    {
      id: "landcover-grass",
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      filter: byClass("grass", "wetland"),
      paint: { "fill-color": p.park, "fill-opacity": 0.7 }
    },
    {
      id: "landcover-wood",
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      filter: byClass("wood"),
      paint: { "fill-color": p.wood }
    },
    {
      id: "landcover-sand",
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      filter: byClass("sand", "beach"),
      paint: { "fill-color": p.sand }
    },
    {
      id: "landuse-residential",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      filter: byClass("residential", "suburb", "neighbourhood"),
      paint: { "fill-color": p.residential }
    },
    {
      id: "landuse-commercial",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      filter: byClass("commercial", "retail"),
      paint: { "fill-color": p.commercial }
    },
    {
      id: "landuse-industrial",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      filter: byClass("industrial", "garages", "dam", "railway", "military"),
      paint: { "fill-color": p.industrial }
    },
    {
      id: "landuse-civic",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      filter: byClass("school", "university", "kindergarten", "college", "library", "hospital", "religious"),
      paint: { "fill-color": p.civic }
    },
    {
      id: "landuse-play",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      filter: byClass("stadium", "pitch", "playground", "cemetery", "zoo", "theme_park"),
      paint: { "fill-color": p.park }
    },
    {
      id: "park",
      type: "fill",
      source: SOURCE,
      "source-layer": "park",
      paint: { "fill-color": p.park }
    },
    {
      id: "aeroway",
      type: "fill",
      source: SOURCE,
      "source-layer": "aeroway",
      minzoom: 11,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      paint: { "fill-color": p.runway }
    },
    {
      id: "waterway-shore",
      type: "line",
      source: SOURCE,
      "source-layer": "waterway",
      minzoom: 11,
      filter: ["all", notTunnel, byClass("river", "canal")],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": p.shore, "line-width": width(11, 2, 14, 5, 18, 22) }
    },
    {
      id: "waterway",
      type: "line",
      source: SOURCE,
      "source-layer": "waterway",
      filter: notTunnel,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.water,
        // MapLibre hanya mengizinkan satu interpolasi zoom per ekspresi, jadi kelas sungai dipilih di tiap titik.
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 8, riverOr(0.8, 0.2), 14, riverOr(3, 1), 18, riverOr(16, 5)]
      }
    },
    // Cincin pasir di bawah air: setengah lebarnya muncul di daratan seperti pantai pulau desa.
    {
      id: "water-shore",
      type: "line",
      source: SOURCE,
      "source-layer": "water",
      filter: notTunnel,
      layout: { "line-join": "round" },
      paint: { "line-color": p.shore, "line-width": width(6, 1, 10, 3, 14, 7, 18, 16) }
    },
    {
      id: "water",
      type: "fill",
      source: SOURCE,
      "source-layer": "water",
      filter: notTunnel,
      paint: { "fill-color": p.water }
    },
    {
      id: "water-foam",
      type: "line",
      source: SOURCE,
      "source-layer": "water",
      minzoom: 9,
      filter: notTunnel,
      layout: { "line-join": "round" },
      paint: { "line-color": p.foam, "line-width": width(9, 0.6, 14, 1.6, 18, 3), "line-offset": width(9, 0.6, 14, 2, 18, 5) }
    },
    {
      id: "path",
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      minzoom: 14,
      filter: ["all", isLine, notTunnel, byClass("path", "pedestrian")],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": p.path, "line-width": width(14, 1, 18, 5), "line-dasharray": [1.2, 1.4] }
    },
    ...roadLayers(p),
    {
      id: "rail",
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      minzoom: 10,
      filter: ["all", isLine, notTunnel, byClass("rail", "transit")],
      paint: { "line-color": p.rail, "line-width": width(10, 1, 16, 3), "line-dasharray": [2, 1.5] }
    },
    {
      id: "boundary",
      type: "line",
      source: SOURCE,
      "source-layer": "boundary",
      filter: ["all", ["<=", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": p.boundary, "line-width": width(3, 0.6, 10, 1.6), "line-dasharray": [3, 2], "line-opacity": 0.7 }
    },
    // Gedung: datar saat jauh, lalu balok pastel yang timbul (makin terasa saat peta dimiringkan),
    // berdinding krem dengan lempeng atap berwarna seperti rumah goal di pulau desa.
    {
      id: "building-flat",
      type: "fill",
      source: SOURCE,
      "source-layer": "building",
      minzoom: 13,
      maxzoom: 15,
      paint: { "fill-color": p.buildingFlat, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, 1] }
    },
    {
      id: "building",
      type: "fill-extrusion",
      source: SOURCE,
      "source-layer": "building",
      minzoom: 15,
      paint: {
        "fill-extrusion-color": buildingColor(p.walls),
        "fill-extrusion-height": WALL_TOP,
        "fill-extrusion-base": ["min", ["coalesce", ["get", "render_min_height"], 0], MAX_HEIGHT],
        "fill-extrusion-opacity": 0.95
      }
    },
    {
      id: "building-roof",
      type: "fill-extrusion",
      source: SOURCE,
      "source-layer": "building",
      minzoom: 15,
      paint: {
        "fill-extrusion-color": buildingColor(p.roofs),
        "fill-extrusion-base": WALL_TOP,
        "fill-extrusion-height": ["+", WALL_TOP, ["max", 0.8, ["min", ["*", WALL_TOP, 0.06], 3]]],
        "fill-extrusion-opacity": 0.95
      }
    },
    {
      id: "label-waterway",
      type: "symbol",
      source: SOURCE,
      "source-layer": "waterway",
      minzoom: 13,
      filter: byClass("river", "canal"),
      layout: { "symbol-placement": "line", "text-field": NAME, "text-font": FONT_ITALIC, "text-size": 12, "text-letter-spacing": 0.1 },
      paint: { "text-color": p.waterText, "text-halo-color": p.waterHalo, "text-halo-width": 1.6 }
    },
    {
      id: "label-water",
      type: "symbol",
      source: SOURCE,
      "source-layer": "water_name",
      layout: {
        "text-field": NAME,
        "text-font": FONT_ITALIC,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 10, 15],
        "text-letter-spacing": 0.15,
        "text-max-width": 6
      },
      paint: { "text-color": p.waterText, "text-halo-color": p.waterHalo, "text-halo-width": 1.6 }
    },
    {
      id: "label-road-minor",
      type: "symbol",
      source: SOURCE,
      "source-layer": "transportation_name",
      minzoom: 15,
      filter: byClass("minor", "service"),
      layout: { "symbol-placement": "line", "text-field": NAME, "text-font": FONT_REGULAR, "text-size": 11 },
      paint: { "text-color": p.textSoft, "text-halo-color": p.halo, "text-halo-width": 1.6 }
    },
    {
      id: "label-road-major",
      type: "symbol",
      source: SOURCE,
      "source-layer": "transportation_name",
      minzoom: 12.5,
      filter: byClass("primary", "secondary", "tertiary", "trunk", "motorway"),
      layout: {
        "symbol-placement": "line",
        "text-field": NAME,
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 17, 13]
      },
      paint: { "text-color": p.text, "text-halo-color": p.halo, "text-halo-width": 2 }
    },
    {
      id: "label-neighbourhood",
      type: "symbol",
      source: SOURCE,
      "source-layer": "place",
      minzoom: 12,
      filter: byClass("suburb", "neighbourhood", "quarter", "hamlet", "village", "isolated_dwelling"),
      layout: {
        "text-field": NAME,
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 16, 14],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.08,
        "text-max-width": 8
      },
      paint: { "text-color": p.textSoft, "text-halo-color": p.halo, "text-halo-width": 2 }
    },
    {
      id: "label-town",
      type: "symbol",
      source: SOURCE,
      "source-layer": "place",
      minzoom: 7,
      maxzoom: 15,
      filter: byClass("town", "village"),
      layout: {
        "text-field": NAME,
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 13, 15],
        "text-max-width": 8
      },
      paint: { "text-color": p.text, "text-halo-color": p.halo, "text-halo-width": 2.2 }
    },
    {
      id: "label-city",
      type: "symbol",
      source: SOURCE,
      "source-layer": "place",
      minzoom: 4,
      maxzoom: 14,
      filter: byClass("city"),
      layout: {
        "text-field": NAME,
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 15, 12, 19],
        "text-max-width": 8
      },
      paint: { "text-color": p.text, "text-halo-color": p.halo, "text-halo-width": 2.6 }
    },
    {
      id: "label-country",
      type: "symbol",
      source: SOURCE,
      "source-layer": "place",
      maxzoom: 8,
      filter: byClass("country"),
      layout: {
        "text-field": NAME,
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 6, 16],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "text-max-width": 7
      },
      paint: { "text-color": p.textSoft, "text-halo-color": p.halo, "text-halo-width": 2.2 }
    }
  ];
}

export function gameSky(theme: MapTheme): SkySpecification {
  const p = PALETTES[theme];
  return {
    "sky-color": p.sky,
    "horizon-color": p.horizon,
    "fog-color": p.fog,
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.75,
    "atmosphere-blend": 0
  };
}

export function gameLight(theme: MapTheme): LightSpecification {
  const p = PALETTES[theme];
  return { anchor: "viewport", color: p.light.color, intensity: p.light.intensity, position: [1.3, 200, 35] };
}

export function buildGameStyle(theme: MapTheme): StyleSpecification {
  return {
    version: 8,
    name: `tepira-desa-${theme}`,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      [SOURCE]: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }
    },
    sky: gameSky(theme),
    light: gameLight(theme),
    layers: layers(PALETTES[theme])
  };
}

/** Ganti suasana tanpa memuat ulang peta (lapisan tambahan seperti titik jajan tetap ada). */
export function applyGameTheme(
  map: {
    getLayer(id: string): unknown;
    setPaintProperty(layer: string, name: string, value: unknown): unknown;
    setSky(sky: SkySpecification): unknown;
    setLight(light: LightSpecification): unknown;
  },
  theme: MapTheme
) {
  for (const layer of layers(PALETTES[theme])) {
    if (!("paint" in layer) || !layer.paint || !map.getLayer(layer.id)) continue;
    for (const [name, value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id, name, value);
  }
  map.setSky(gameSky(theme));
  map.setLight(gameLight(theme));
}

/** Suasana peta yang senada dengan cuaca desa saat ini (mendung tetap siang). */
export function themeForVillage(time: "day" | "cloudy" | "sunset" | "night"): MapTheme {
  return time === "sunset" ? "senja" : time === "night" ? "malam" : "siang";
}
