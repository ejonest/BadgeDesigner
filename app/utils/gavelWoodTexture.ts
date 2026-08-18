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

const loader = typeof document === "undefined" ? null : new THREE.TextureLoader();
const inflight = new Map<string, Promise<GavelWoodMaps>>();
const ready = new Map<string, GavelWoodMaps>();

function emptyMaps(style: GavelStyleDef): GavelWoodMaps {
  return { ...EMPTY, roughness: style.roughness };
}

/**
 * Scanned wood is tiled by the lathe UVs in inches (see applyLatheWoodUvs), so
 * every map repeats and needs no per-style offset.
 */
function configure(tex: THREE.Texture, srgb: boolean): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

function loadConfigured(url: string, srgb: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    if (!loader) {
      reject(new Error("TextureLoader is not available"));
      return;
    }
    loader.load(
      url,
      (tex) => resolve(configure(tex, srgb)),
      undefined,
      reject,
    );
  });
}

/** Instant if this wood has already finished loading; otherwise null. */
export function getReadyGavelWoodMaps(
  style: GavelStyleDef,
): GavelWoodMaps | null {
  if (!style.textureSet) return emptyMaps(style);
  return ready.get(style.textureSet) ?? null;
}

/**
 * Loads the ambientCG (CC0) scans built by scripts/build-gavel-wood-textures.mjs.
 * Resolves only after color/normal/roughness are in memory so the material never
 * renders an unloaded (black) map. Results are cached per texture set.
 */
export function loadGavelWoodMaps(
  style: GavelStyleDef,
): Promise<GavelWoodMaps> {
  if (typeof document === "undefined" || !style.textureSet) {
    return Promise.resolve(emptyMaps(style));
  }

  const key = style.textureSet;
  const cached = ready.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;

  const base = `/textures/gavel/${key}`;
  const promise = Promise.all([
    loadConfigured(`${base}/color.jpg`, true),
    loadConfigured(`${base}/normal.jpg`, false),
    loadConfigured(`${base}/roughness.jpg`, false),
  ])
    .then(([map, normalMap, roughnessMap]) => {
      const maps: GavelWoodMaps = {
        map,
        normalMap,
        roughnessMap,
        roughness: style.roughness,
      };
      ready.set(key, maps);
      inflight.delete(key);
      return maps;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

/** Kick off every catalog wood so switching styles does not wait on the network. */
export function preloadGavelWoodMaps(styles: readonly GavelStyleDef[]): void {
  for (const style of styles) {
    void loadGavelWoodMaps(style).catch(() => {
      /* Keep the previous wood on screen if a set fails to load. */
    });
  }
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
