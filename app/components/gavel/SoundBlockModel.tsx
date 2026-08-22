import { useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { GavelStyleDef } from "~/constants/gavelStyles";
import {
  SOUND_BLOCK_BODY_H_IN,
  SOUND_BLOCK_D_IN,
  SOUND_BLOCK_FOOT_H_IN,
  SOUND_BLOCK_H_IN,
  SOUND_BLOCK_PROFILE,
  SOUND_BLOCK_TOP_FACE_W_IN,
  SOUND_BLOCK_W_IN,
} from "~/constants/gavelStyles";
import { createMoldedBlockGeometry } from "~/utils/soundBlockGeometry";
import { useLoadedWoodMaps } from "~/components/gavel/GavelModel";

type Props = {
  style: GavelStyleDef;
  /** Transparent PNG of centered text, drawn on the wood top. */
  topTextureUrl?: string;
};

/** Keep personalization clear of the softened arris around the top panel. */
const TOP_ART_IN = SOUND_BLOCK_TOP_FACE_W_IN - 0.22;

const FOOT_R_IN = 0.11;
const FOOT_INSET_IN = 0.3;

/**
 * Tiling comes from the geometry's inch-based UVs, so the shared map is cloned
 * only to give this mesh its own wrap settings.
 */
function cloneWoodMap(source: THREE.Texture | null): THREE.Texture | null {
  if (!source) return null;
  const tex = source.clone();
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Square striking block matching the Gavels Fast product photos: one molded
 * body on rubber feet. Personalization is printed on the raised wood panel —
 * there is no metal plate.
 */
export function SoundBlockModel({ style, topTextureUrl = "" }: Props) {
  const woodMaps = useLoadedWoodMaps(style);
  const [topMap, setTopMap] = useState<THREE.Texture | null>(null);

  const bottomY = -SOUND_BLOCK_BODY_H_IN / 2;
  const bodyY = bottomY + SOUND_BLOCK_FOOT_H_IN;
  const topSurfaceY = bodyY + SOUND_BLOCK_H_IN;

  useLayoutEffect(() => {
    if (!topTextureUrl) {
      setTopMap(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(topTextureUrl, (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = 8;
      loaded.needsUpdate = true;
      if (!cancelled) setTopMap(loaded);
    });
    return () => {
      cancelled = true;
      tex.dispose();
    };
  }, [topTextureUrl]);

  const bodyGeom = useMemo(
    () =>
      createMoldedBlockGeometry(
        SOUND_BLOCK_W_IN,
        SOUND_BLOCK_D_IN,
        SOUND_BLOCK_PROFILE,
      ),
    [],
  );

  useLayoutEffect(() => {
    return () => bodyGeom.dispose();
  }, [bodyGeom]);

  const woodColor = useMemo(() => cloneWoodMap(woodMaps.map), [woodMaps.map]);
  const woodNormal = useMemo(
    () => cloneWoodMap(woodMaps.normalMap),
    [woodMaps.normalMap],
  );
  const woodRough = useMemo(
    () => cloneWoodMap(woodMaps.roughnessMap),
    [woodMaps.roughnessMap],
  );

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: woodColor ? "#ffffff" : style.bodyColor,
        roughness: woodMaps.roughness,
        metalness: style.metalness,
        map: woodColor ?? undefined,
        normalMap: woodNormal ?? undefined,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: woodRough ?? undefined,
      }),
    [style, woodColor, woodNormal, woodRough, woodMaps.roughness],
  );

  const footMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1d1b19",
        roughness: 0.85,
        metalness: 0,
      }),
    [],
  );

  const topMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.72,
        metalness: 0,
        map: topMap ?? undefined,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [topMap],
  );

  const footX = SOUND_BLOCK_W_IN / 2 - FOOT_INSET_IN;
  const footZ = SOUND_BLOCK_D_IN / 2 - FOOT_INSET_IN;
  const feet: readonly (readonly [number, number])[] = [
    [-footX, -footZ],
    [footX, -footZ],
    [-footX, footZ],
    [footX, footZ],
  ];

  return (
    <group>
      <mesh
        geometry={bodyGeom}
        position={[0, bodyY, 0]}
        material={bodyMat}
        castShadow
        receiveShadow
      />
      {feet.map(([x, z]) => (
        <mesh
          key={`${x}:${z}`}
          position={[x, bottomY + SOUND_BLOCK_FOOT_H_IN / 2, z]}
          material={footMat}
          castShadow
        >
          <cylinderGeometry
            args={[FOOT_R_IN, FOOT_R_IN, SOUND_BLOCK_FOOT_H_IN, 20]}
          />
        </mesh>
      ))}
      {topMap ? (
        <mesh
          position={[0, topSurfaceY + 0.004, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={topMat}
        >
          <planeGeometry args={[TOP_ART_IN, TOP_ART_IN]} />
        </mesh>
      ) : null}
    </group>
  );
}
