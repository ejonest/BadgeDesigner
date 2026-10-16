import * as THREE from "three";
import {
  gavelMetalAlbedoUrl,
  type GavelMetalAlbedoKind,
} from "~/constants/gavelStyles";

/**
 * Scanned finishes for the gavel band and stand plaque, built by
 * scripts/build-gavel-metal-textures.mjs. The albedo is loaded as a plain image
 * because the band and plate artwork is composited on a canvas alongside the
 * engraving; the normal and roughness maps go straight to the 3D material.
 */
export type GavelMetalTextureSet = "metal-gold" | "metal-silver";

/** Edge of the square maps the build script emits, in texels. */
export const GAVEL_METAL_TEXTURE_PX = 1024;

export type GavelMetalMaps = {
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
};

const EMPTY_MAPS: GavelMetalMaps = { normalMap: null, roughnessMap: null };

type AlbedoKey = `${GavelMetalTextureSet}:${GavelMetalAlbedoKind}`;

const albedoReady = new Map<AlbedoKey, HTMLImageElement>();
const albedoInflight = new Map<AlbedoKey, Promise<HTMLImageElement>>();
const mapsReady = new Map<GavelMetalTextureSet, GavelMetalMaps>();
const mapsInflight = new Map<GavelMetalTextureSet, Promise<GavelMetalMaps>>();

const listeners = new Set<() => void>();
let version = 0;

function announce() {
  version += 1;
  for (const fn of listeners) fn();
}

/** Notifies when a finish finishes loading, so proofs repaint off the scan. */
export function subscribeGavelMetalTextures(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Store snapshot for useSyncExternalStore; changes as each finish lands. */
export function getGavelMetalTexturesVersion(): number {
  return version;
}

export function getServerGavelMetalTexturesVersion(): number {
  return 0;
}

/** The albedo if it is already decoded, otherwise null — never a partial image. */
export function getReadyGavelMetalAlbedo(
  set: GavelMetalTextureSet,
  kind: GavelMetalAlbedoKind = "color",
): HTMLImageElement | null {
  return albedoReady.get(`${set}:${kind}`) ?? null;
}

export function loadGavelMetalAlbedo(
  set: GavelMetalTextureSet,
  kind: GavelMetalAlbedoKind = "color",
): Promise<HTMLImageElement> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("No document"));
  }
  const key: AlbedoKey = `${set}:${kind}`;
  const done = albedoReady.get(key);
  if (done) return Promise.resolve(done);
  const pending = albedoInflight.get(key);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      albedoReady.set(key, img);
      albedoInflight.delete(key);
      announce();
      resolve(img);
    };
    img.onerror = () => {
      albedoInflight.delete(key);
      reject(new Error(`Failed to load ${set} ${kind} albedo`));
    };
    img.src = gavelMetalAlbedoUrl(set, kind);
  });

  albedoInflight.set(key, promise);
  return promise;
}

const loader = typeof document === "undefined" ? null : new THREE.TextureLoader();

function configure(tex: THREE.Texture): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

function loadConfigured(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    if (!loader) {
      reject(new Error("TextureLoader is not available"));
      return;
    }
    loader.load(url, (tex) => resolve(configure(tex)), undefined, reject);
  });
}

export function getReadyGavelMetalMaps(
  set: GavelMetalTextureSet | null,
): GavelMetalMaps | null {
  if (!set) return EMPTY_MAPS;
  return mapsReady.get(set) ?? null;
}

/**
 * Resolves only once both maps are in memory, so the material never renders an
 * unloaded (black) normal map over the metal.
 */
export function loadGavelMetalMaps(
  set: GavelMetalTextureSet | null,
): Promise<GavelMetalMaps> {
  if (typeof document === "undefined" || !set) {
    return Promise.resolve(EMPTY_MAPS);
  }
  const done = mapsReady.get(set);
  if (done) return Promise.resolve(done);
  const pending = mapsInflight.get(set);
  if (pending) return pending;

  const base = `/textures/gavel/${set}`;
  const promise = Promise.all([
    loadConfigured(`${base}/normal.jpg`),
    loadConfigured(`${base}/roughness.jpg`),
  ])
    .then(([normalMap, roughnessMap]) => {
      const maps: GavelMetalMaps = { normalMap, roughnessMap };
      mapsReady.set(set, maps);
      mapsInflight.delete(set);
      return maps;
    })
    .catch((err) => {
      mapsInflight.delete(set);
      throw err;
    });

  mapsInflight.set(set, promise);
  return promise;
}

/** Warms both finishes so switching gold to silver does not wait on the network. */
export function preloadGavelMetalTextures(
  sets: readonly GavelMetalTextureSet[] = ["metal-gold", "metal-silver"],
): void {
  for (const set of sets) {
    for (const kind of ["color", "proof"] as const) {
      void loadGavelMetalAlbedo(set, kind).catch(() => {
        /* The painter falls back to its procedural finish. */
      });
    }
    void loadGavelMetalMaps(set).catch(() => {
      /* The material falls back to a flat roughness. */
    });
  }
}
