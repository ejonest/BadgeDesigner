import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import type { GavelHandleLengthId, GavelStyleDef } from "~/constants/gavelStyles";
import {
  GAVEL_BAND_GOLD_HEX,
  GAVEL_HANDLE_LENGTH_IN,
  GAVEL_HEAD_DIAMETER_IN,
  GAVEL_HEAD_LENGTH_IN,
  GAVEL_BAND_DIAMETER_IN,
  GAVEL_BAND_HEIGHT_IN,
} from "~/constants/gavelStyles";
import {
  applyLatheWoodUvs,
  makeGavelWoodMaps,
} from "~/utils/gavelWoodTexture";

type Props = {
  style: GavelStyleDef;
  bandTextureUrl: string;
  bandHex?: string;
  handleLength?: GavelHandleLengthId;
};

const HEAD_R = GAVEL_HEAD_DIAMETER_IN / 2;
const HEAD_HALF = GAVEL_HEAD_LENGTH_IN / 2;
const BAND_H = GAVEL_BAND_HEIGHT_IN;
/** Recessed below the wood beads, and the basis for the engraving wrap width. */
const BAND_R = GAVEL_BAND_DIAMETER_IN / 2;
const HANDLE_TENON = HEAD_R * 0.42;
/** Widest point of the shaft, measured off the drawing at 36.5% of head radius. */
const HANDLE_MAX_R = HEAD_R * 0.365;
/**
 * The band wraps like the physical strip: both ends meet at the handle (−Z) and
 * the artwork centers on the face opposite it (+Z). Cylinder UVs start the seam
 * at +Z, so a half turn moves it onto the handle.
 */
const BAND_TEXT_ROTATION_Y = Math.PI;

/** Radial segments for each lathe; also the UV divisions around the wood. */
const HEAD_SEGMENTS = 128;
const HANDLE_SEGMENTS = 64;

/**
 * Inches of real wood covered by one tile of the scanned maps. Tuned so the
 * grain reads at the scale of the product photos on a 2" head.
 */
const WOOD_TILE_IN = 6;

function v2(x: number, y: number) {
  return new THREE.Vector2(x, y);
}

/**
 * Half of the turned end cap, traced off the dimensioned product drawing.
 * `u` runs 0 at the striking face to 1 at the edge of the metal band, `r` is a
 * fraction of the head radius — so the features stay put if the head or band
 * dimensions change.
 */
const HEAD_CAP_PROFILE: readonly (readonly [number, number])[] = [
  // striking face: shallow dome rolling over a generous rounded rim
  [0.0, 0.0],
  [0.004, 0.26],
  [0.01, 0.4],
  [0.017, 0.423],
  [0.0416, 0.616],
  [0.0662, 0.706],
  [0.0908, 0.773],
  [0.1154, 0.821],
  [0.14, 0.849],
  // brief shelf, then the outer bead swells
  [0.1646, 0.857],
  [0.1892, 0.864],
  [0.2138, 0.892],
  [0.2384, 0.932],
  [0.263, 0.957],
  [0.2876, 0.976],
  [0.3122, 0.989],
  [0.3368, 0.995],
  [0.3614, 0.997],
  // outer bead crown — domed, not flat
  [0.386, 1.0],
  [0.4106, 1.0],
  [0.4352, 0.998],
  [0.4598, 0.995],
  [0.4844, 0.987],
  [0.509, 0.971],
  [0.5336, 0.951],
  [0.5582, 0.923],
  [0.5828, 0.889],
  [0.6074, 0.866],
  // rounded groove between the two beads
  [0.632, 0.85],
  [0.6566, 0.837],
  [0.6812, 0.816],
  [0.7058, 0.798],
  [0.7304, 0.788],
  [0.755, 0.811],
  [0.7796, 0.858],
  [0.8042, 0.912],
  [0.8288, 0.959],
  // inner bead crown, then it eases down to the band
  [0.8534, 0.983],
  [0.878, 0.993],
  [0.9026, 0.997],
  [0.9272, 0.997],
  [0.9518, 0.988],
  [0.9764, 0.986],
  [1.0, 0.985],
];

function headProfilePoints(): THREE.Vector2[] {
  const R = HEAD_R;
  const H = HEAD_HALF;
  const BH = BAND_H / 2;
  const capLength = H - BH;
  const lower = [
    ...HEAD_CAP_PROFILE.map(([u, r]) =>
      v2(Math.max(r * R, 0.001), -H + u * capLength),
    ),
    // shallow channel so the band edge still reads against the wood
    v2(BAND_R * 0.99, -BH + 0.01),
    v2(BAND_R * 0.99, BH - 0.01),
    v2(BAND_R, BH),
  ];
  const upper = lower
    .slice(0, -3)
    .reverse()
    .map((p) => v2(p.x, -p.y));
  return [...lower, ...upper];
}

/**
 * Handle traced off the same drawing: flare at the head, a turned waist and
 * collar bead in the first fifth, then a long shaft that swells toward the
 * grip and closes with a small finial. `e` fractions are positions along the
 * exposed shaft in the drawing, so any handle length keeps the proportions.
 */
function handleProfilePoints(exposedLengthIn: number): THREE.Vector2[] {
  const t = HANDLE_TENON;
  const L = t + exposedLengthIn;
  const hr = HANDLE_MAX_R;
  const e = (frac: number) => t + exposedLengthIn * frac;
  return [
    v2(hr * 0.9, 0),
    v2(hr * 1.0, t - 0.08),
    // flare where the handle meets the band
    v2(hr * 1.46, t),
    v2(hr * 1.2, t + 0.05),
    // waist, then the first small bead
    v2(hr * 0.82, e(0.035)),
    v2(hr * 0.98, e(0.051)),
    v2(hr * 0.86, e(0.085)),
    v2(hr * 0.74, e(0.117)),
    v2(hr * 0.7, e(0.166)),
    // collar bead about a fifth of the way down
    v2(hr * 0.94, e(0.183)),
    v2(hr * 1.02, e(0.2)),
    v2(hr * 0.82, e(0.216)),
    // thinnest point of the shaft, then a long swell to the grip
    v2(hr * 0.7, e(0.249)),
    v2(hr * 0.74, e(0.299)),
    v2(hr * 0.8, e(0.365)),
    v2(hr * 0.86, e(0.431)),
    v2(hr * 0.92, e(0.496)),
    v2(hr * 0.96, e(0.562)),
    v2(hr * 1.0, e(0.66)),
    v2(hr * 1.0, e(0.694)),
    v2(hr * 0.96, e(0.777)),
    v2(hr * 0.92, e(0.843)),
    v2(hr * 0.86, e(0.909)),
    // finial at the tip
    v2(hr * 0.72, e(0.943)),
    v2(hr * 0.62, e(0.975)),
    v2(hr * 0.46, e(0.991)),
    v2(hr * 0.12, L - 0.01),
    v2(0.001, L),
  ];
}

function makeBrushedBandMap(hex: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const w = 512;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + (i % 4) * 0.015})`;
    ctx.fillRect(0, (i / 90) * h, w, 1.2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Lathe-turned gavel matching Gavels Fast product photos:
 * same head on every SKU, handle length varies, wood + band materials swap.
 * Stands on a striking face (Y up); handle extends −Z.
 */
export function GavelModel({
  style,
  bandTextureUrl,
  bandHex = GAVEL_BAND_GOLD_HEX,
  handleLength = "standard",
}: Props) {
  const handleIn = GAVEL_HANDLE_LENGTH_IN[handleLength];

  const headGeom = useMemo(() => {
    const profile = headProfilePoints();
    const geom = new THREE.LatheGeometry(profile, HEAD_SEGMENTS);
    applyLatheWoodUvs(geom, profile, HEAD_SEGMENTS, WOOD_TILE_IN);
    return geom;
  }, []);

  const handleGeom = useMemo(() => {
    const profile = handleProfilePoints(handleIn);
    const geom = new THREE.LatheGeometry(profile, HANDLE_SEGMENTS);
    applyLatheWoodUvs(geom, profile, HANDLE_SEGMENTS, WOOD_TILE_IN);
    return geom;
  }, [handleIn]);

  const bandMap = useMemo(() => {
    if (!bandTextureUrl) return makeBrushedBandMap(bandHex);
    const loader = new THREE.TextureLoader();
    const tex = loader.load(bandTextureUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    return tex;
  }, [bandTextureUrl, bandHex]);

  const woodMaps = useMemo(() => makeGavelWoodMaps(style), [style]);

  useLayoutEffect(() => {
    return () => {
      bandMap?.dispose();
      woodMaps.map?.dispose();
      woodMaps.normalMap?.dispose();
      woodMaps.roughnessMap?.dispose();
    };
  }, [bandMap, woodMaps]);

  useLayoutEffect(() => {
    return () => handleGeom.dispose();
  }, [handleGeom]);

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: woodMaps.map ? "#ffffff" : style.bodyColor,
        roughness: woodMaps.roughness,
        metalness: style.metalness,
        map: woodMaps.map ?? undefined,
        normalMap: woodMaps.normalMap ?? undefined,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughnessMap: woodMaps.roughnessMap ?? undefined,
      }),
    [style, woodMaps],
  );

  const bandMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: bandMap ? "#ffffff" : bandHex,
        roughness: 0.28,
        metalness: 0.9,
        map: bandMap ?? undefined,
      }),
    [bandHex, bandMap],
  );

  return (
    <group>
      <mesh geometry={headGeom} material={bodyMat} castShadow receiveShadow />
      <mesh rotation={[0, BAND_TEXT_ROTATION_Y, 0]} material={bandMat} castShadow>
        <cylinderGeometry
          args={[BAND_R * 1.004, BAND_R * 1.004, BAND_H * 0.965, 128, 1, true]}
        />
      </mesh>
      {/* Lathe along +Y, then −90° X so the tip goes −Z. Tenon sits inside the head. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={handleGeom} material={bodyMat} castShadow />
      </group>
    </group>
  );
}