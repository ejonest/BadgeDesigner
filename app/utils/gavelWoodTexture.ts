import * as THREE from "three";
import type { GavelStyleDef } from "~/constants/gavelStyles";

export type GavelWoodMaps = {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  /** Multiplies the roughness map; 1 keeps the scanned satin finish as-is. */
  roughness: number;
};

const EMPTY: GavelWoodMaps = {
  map: null,
  normalMap: null,
  roughnessMap: null,
  roughness: 1,
};

/**
 * Scanned wood is tiled by the lathe UVs in inches (see applyLatheWoodUvs), so
 * every map repeats and needs no per-style offset.
 */
function configure(tex: THREE.Texture, srgb: boolean): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Loads the ambientCG (CC0) scans built by scripts/build-gavel-wood-textures.mjs.
 * Falls back to a flat material when a style has no scanned set.
 */
export function makeGavelWoodMaps(style: GavelStyleDef): GavelWoodMaps {
  if (typeof document === "undefined") return EMPTY;

  if (!style.textureSet) {
    return { ...EMPTY, roughness: style.roughness };
  }

  const loader = new THREE.TextureLoader();
  const base = `/textures/gavel/${style.textureSet}`;

  return {
    map: configure(loader.load(`${base}/color.jpg`), true),
    normalMap: configure(loader.load(`${base}/normal.jpg`), false),
    roughnessMap: configure(loader.load(`${base}/roughness.jpg`), false),
    roughness: style.roughness,
  };
}

/**
 * Rewrites LatheGeometry UVs so wood tiles by real inches instead of by profile
 * point index. Three.js spaces V evenly across profile points, which bunches the
 * grain wherever points cluster (the turned beads and collars). Measuring arc
 * length along the profile keeps grain the same size over beads and shaft alike.
 *
 * U is a whole number of tiles around the circumference so the seam stays hidden
 * on these seamless scans.
 */
export function applyLatheWoodUvs(
  geometry: THREE.BufferGeometry,
  profile: readonly THREE.Vector2[],
  segments: number,
  tileInches: number,
): void {
  const uv = geometry.getAttribute("uv");
  const count = profile.length;
  if (!uv || uv.count !== (segments + 1) * count) return;

  const arc = new Float32Array(count);
  let maxRadius = profile[0].x;
  for (let j = 1; j < count; j++) {
    arc[j] = arc[j - 1] + profile[j].distanceTo(profile[j - 1]);
    maxRadius = Math.max(maxRadius, profile[j].x);
  }

  const tilesAround = Math.max(
    1,
    Math.round((2 * Math.PI * maxRadius) / tileInches),
  );

  for (let i = 0; i <= segments; i++) {
    const u = (i / segments) * tilesAround;
    for (let j = 0; j < count; j++) {
      uv.setXY(i * count + j, u, arc[j] / tileInches);
    }
  }
  uv.needsUpdate = true;
}
