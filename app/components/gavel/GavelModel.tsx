import { useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { GavelStyleDef } from "~/constants/gavelStyles";
import {
  GAVEL_BAND_GOLD_HEX,
  GAVEL_HANDLE_LENGTH_IN,
} from "~/constants/gavelStyles";
import {
  BAND_H,
  BAND_R,
  handleProfilePoints,
  headProfilePoints,
} from "~/utils/gavelProfiles";
import {
  applyLatheWoodUvs,
  getReadyGavelWoodMaps,
  loadGavelWoodMaps,
  type GavelWoodMaps,
} from "~/utils/gavelWoodTexture";
import { fillBrushedMetalBand } from "~/utils/gavelBandTexture";

type Props = {
  style: GavelStyleDef;
  bandTextureUrl: string;
  bandHex?: string;
};

/**
 * The band wraps like the physical strip: both ends meet at the handle (−Z) and
 * the artwork centers on the face opposite it (+Z). Cylinder UVs start the seam
 * at +Z, so a half turn moves it onto the handle.
 */
const BAND_TEXT_ROTATION_Y = Math.PI;

function fallbackWoodMaps(style: GavelStyleDef): GavelWoodMaps {
  return {
    map: null,
    normalMap: null,
    roughnessMap: null,
    roughness: style.roughness,
  };
}

/**
 * Keep the last fully-loaded wood on screen until the next set is ready.
 * Assigning TextureLoader results before onLoad paints a 1×1 black map.
 */
export function useLoadedWoodMaps(style: GavelStyleDef): GavelWoodMaps {
  const [maps, setMaps] = useState<GavelWoodMaps>(
    () => getReadyGavelWoodMaps(style) ?? fallbackWoodMaps(style),
  );

  useLayoutEffect(() => {
    const ready = getReadyGavelWoodMaps(style);
    if (ready) {
      setMaps(ready);
      return;
    }
    let cancelled = false;
    void loadGavelWoodMaps(style)
      .then((loaded) => {
        if (!cancelled) setMaps(loaded);
      })
      .catch(() => {
        /* Keep showing the previous wood. */
      });
    return () => {
      cancelled = true;
    };
  }, [style]);

  return maps;
}

/** Radial segments for each lathe; also the UV divisions around the wood. */
const HEAD_SEGMENTS = 128;
const HANDLE_SEGMENTS = 64;

/**
 * Inches of real wood covered by one tile of the scanned maps. Tuned so the
 * grain reads at the scale of the product photos on a 2" head.
 */
const WOOD_TILE_IN = 6;

function makeBrushedBandMap(hex: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const w = 1024;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  fillBrushedMetalBand(ctx, w, h, hex);
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
 * same head and handle on every SKU, wood + band materials swap.
 * Stands on a striking face (Y up); handle extends −Z.
 */
export function GavelModel({
  style,
  bandTextureUrl,
  bandHex = GAVEL_BAND_GOLD_HEX,
}: Props) {
  const handleIn = GAVEL_HANDLE_LENGTH_IN;

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

  const woodMaps = useLoadedWoodMaps(style);

  useLayoutEffect(() => {
    return () => {
      bandMap?.dispose();
    };
  }, [bandMap]);

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
        // Satin brushed metal: enough roughness to blur studio HDR, enough
        // metalness that the baked grain still reads as shiny.
        roughness: 0.42,
        metalness: 0.78,
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