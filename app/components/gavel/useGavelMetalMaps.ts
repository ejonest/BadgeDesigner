import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  GAVEL_METAL_TEXTURE_PX,
  getReadyGavelMetalMaps,
  loadGavelMetalMaps,
  type GavelMetalMaps,
  type GavelMetalTextureSet,
} from "~/utils/gavelMetalTexture";

const EMPTY: GavelMetalMaps = { normalMap: null, roughnessMap: null };

function cloneTiled(
  source: THREE.Texture | null,
  repeatX: number,
  repeatY: number,
): THREE.Texture | null {
  if (!source) return null;
  const tex = source.clone();
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Scanned relief for a metal finish, sized to register with the brush the
 * canvas paints into the albedo. That artwork tiles the scan texel for texel,
 * so pass the surface's artwork dimensions and the repeats follow.
 *
 * Returns empty maps until both files are decoded, since assigning a texture
 * before onLoad renders it as a 1x1 black map over the metal.
 */
export function useGavelMetalMaps(
  set: GavelMetalTextureSet | null,
  artworkWidthPx: number,
  artworkHeightPx: number,
): GavelMetalMaps {
  const [loaded, setLoaded] = useState<GavelMetalMaps>(
    () => getReadyGavelMetalMaps(set) ?? EMPTY,
  );

  useEffect(() => {
    const ready = getReadyGavelMetalMaps(set);
    if (ready) {
      setLoaded(ready);
      return;
    }
    let cancelled = false;
    void loadGavelMetalMaps(set)
      .then((maps) => {
        if (!cancelled) setLoaded(maps);
      })
      .catch(() => {
        /* Fall back to the material's flat roughness. */
      });
    return () => {
      cancelled = true;
    };
  }, [set]);

  const tiled = useMemo(() => {
    const x = artworkWidthPx / GAVEL_METAL_TEXTURE_PX;
    const y = artworkHeightPx / GAVEL_METAL_TEXTURE_PX;
    return {
      normalMap: cloneTiled(loaded.normalMap, x, y),
      roughnessMap: cloneTiled(loaded.roughnessMap, x, y),
    };
  }, [artworkHeightPx, artworkWidthPx, loaded]);

  useEffect(
    () => () => {
      tiled.normalMap?.dispose();
      tiled.roughnessMap?.dispose();
    },
    [tiled],
  );

  return tiled;
}
