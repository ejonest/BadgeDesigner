import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import type { GavelStyleDef } from "~/constants/gavelStyles";
import {
  GAVEL_BAND_GOLD_HEX,
  SOUND_BLOCK_BASE_D_IN,
  SOUND_BLOCK_BASE_H_IN,
  SOUND_BLOCK_BASE_W_IN,
  SOUND_BLOCK_BODY_H_IN,
  SOUND_BLOCK_MID_D_IN,
  SOUND_BLOCK_MID_H_IN,
  SOUND_BLOCK_MID_W_IN,
  SOUND_BLOCK_TOP_D_IN,
  SOUND_BLOCK_TOP_H_IN,
  SOUND_BLOCK_TOP_W_IN,
} from "~/constants/gavelStyles";
import { useLoadedWoodMaps } from "~/components/gavel/GavelModel";

type Props = {
  style: GavelStyleDef;
  plateTextureUrl: string;
  plateHex?: string;
};

const WOOD_TILE_IN = 6;
/** Metal nameplate on the front of the base tier. */
const PLATE_W = 2.7;
const PLATE_H = 0.6;
const PLATE_T = 0.04;
const TOP_BEVEL = 0.075;
const BEVEL_SEGS = 5;

const TIERS = [
  {
    w: SOUND_BLOCK_BASE_W_IN,
    d: SOUND_BLOCK_BASE_D_IN,
    h: SOUND_BLOCK_BASE_H_IN,
  },
  {
    w: SOUND_BLOCK_MID_W_IN,
    d: SOUND_BLOCK_MID_D_IN,
    h: SOUND_BLOCK_MID_H_IN,
  },
  {
    w: SOUND_BLOCK_TOP_W_IN,
    d: SOUND_BLOCK_TOP_D_IN,
    h: SOUND_BLOCK_TOP_H_IN,
  },
] as const;

function cloneTiledMap(
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

function pushTri(
  positions: number[],
  normals: number[],
  uvs: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  uvA: readonly [number, number],
  uvB: readonly [number, number],
  uvC: readonly [number, number],
) {
  const n = new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a))
    .normalize();
  for (const p of [a, b, c]) {
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
  }
  uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
}

function pushQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  p00: THREE.Vector3,
  p10: THREE.Vector3,
  p11: THREE.Vector3,
  p01: THREE.Vector3,
  uv00: readonly [number, number],
  uv10: readonly [number, number],
  uv11: readonly [number, number],
  uv01: readonly [number, number],
) {
  pushTri(positions, normals, uvs, p00, p10, p11, uv00, uv10, uv11);
  pushTri(positions, normals, uvs, p00, p11, p01, uv00, uv11, uv01);
}

/**
 * Box with a roundover on the top rim only — bottoms of the steps stay sharp.
 */
function createTopBeveledBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevel: number,
  segments: number,
): THREE.BufferGeometry {
  const b = Math.min(bevel, width * 0.45, depth * 0.45, height * 0.42);
  const hw = width / 2;
  const hd = depth / 2;
  const y0 = -height / 2;
  const y1 = height / 2;
  const yb = y1 - b;

  type Ring = { y: number; inset: number };
  const rings: Ring[] = [
    { y: y0, inset: 0 },
    { y: yb, inset: 0 },
  ];
  for (let i = 1; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2);
    rings.push({
      y: yb + b * Math.sin(a),
      inset: b * (1 - Math.cos(a)),
    });
  }

  const corners = (inset: number) => {
    const x = hw - inset;
    const z = hd - inset;
    return [
      new THREE.Vector3(-x, 0, -z),
      new THREE.Vector3(x, 0, -z),
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(-x, 0, z),
    ];
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const bottom = corners(0).map((p) => p.clone().setY(y0));
  pushQuad(
    positions,
    normals,
    uvs,
    bottom[0],
    bottom[1],
    bottom[2],
    bottom[3],
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  );

  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r];
    const c = rings[r + 1];
    const pa = corners(a.inset).map((p) => p.clone().setY(a.y));
    const pc = corners(c.inset).map((p) => p.clone().setY(c.y));
    const v0 = (a.y - y0) / height;
    const v1 = (c.y - y0) / height;
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      pushQuad(
        positions,
        normals,
        uvs,
        pa[k],
        pc[k],
        pc[k1],
        pa[k1],
        [0, v0],
        [0, v1],
        [1, v1],
        [1, v0],
      );
    }
  }

  const topRing = rings[rings.length - 1];
  const top = corners(topRing.inset).map((p) => p.clone().setY(topRing.y));
  pushQuad(
    positions,
    normals,
    uvs,
    top[0],
    top[3],
    top[2],
    top[1],
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  );

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

function tierCentersY(): [number, number, number] {
  const bottom = -SOUND_BLOCK_BODY_H_IN / 2;
  const baseY = bottom + SOUND_BLOCK_BASE_H_IN / 2;
  const midY = bottom + SOUND_BLOCK_BASE_H_IN + SOUND_BLOCK_MID_H_IN / 2;
  const topY =
    bottom +
    SOUND_BLOCK_BASE_H_IN +
    SOUND_BLOCK_MID_H_IN +
    SOUND_BLOCK_TOP_H_IN / 2;
  return [baseY, midY, topY];
}

/**
 * Three-step striking block matching the Gavels Fast product photos.
 * Custom artwork sits on a metal plate on the lower front of the base.
 */
export function SoundBlockModel({
  style,
  plateTextureUrl,
  plateHex = GAVEL_BAND_GOLD_HEX,
}: Props) {
  const woodMaps = useLoadedWoodMaps(style);
  const [baseY, midY, topY] = tierCentersY();

  const plateMap = useMemo(() => {
    if (!plateTextureUrl) return null;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(plateTextureUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [plateTextureUrl]);

  const tierGeoms = useMemo(
    () =>
      TIERS.map((tier) =>
        createTopBeveledBoxGeometry(
          tier.w,
          tier.h,
          tier.d,
          Math.min(TOP_BEVEL, tier.h * 0.42),
          BEVEL_SEGS,
        ),
      ),
    [],
  );

  useLayoutEffect(() => {
    return () => {
      plateMap?.dispose();
      for (const geom of tierGeoms) geom.dispose();
    };
  }, [plateMap, tierGeoms]);

  const tiledColor = useMemo(
    () =>
      cloneTiledMap(
        woodMaps.map,
        SOUND_BLOCK_BASE_W_IN / WOOD_TILE_IN,
        SOUND_BLOCK_BASE_D_IN / WOOD_TILE_IN,
      ),
    [woodMaps.map],
  );
  const tiledNormal = useMemo(
    () =>
      cloneTiledMap(
        woodMaps.normalMap,
        SOUND_BLOCK_BASE_W_IN / WOOD_TILE_IN,
        SOUND_BLOCK_BASE_D_IN / WOOD_TILE_IN,
      ),
    [woodMaps.normalMap],
  );
  const tiledRough = useMemo(
    () =>
      cloneTiledMap(
        woodMaps.roughnessMap,
        SOUND_BLOCK_BASE_W_IN / WOOD_TILE_IN,
        SOUND_BLOCK_BASE_D_IN / WOOD_TILE_IN,
      ),
    [woodMaps.roughnessMap],
  );

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: tiledColor ? "#ffffff" : style.bodyColor,
        roughness: woodMaps.roughness,
        metalness: style.metalness,
        map: tiledColor ?? undefined,
        normalMap: tiledNormal ?? undefined,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: tiledRough ?? undefined,
      }),
    [style, tiledColor, tiledNormal, tiledRough, woodMaps.roughness],
  );

  const plateMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: plateMap ? "#ffffff" : plateHex,
        roughness: 0.55,
        metalness: 0.62,
        map: plateMap ?? undefined,
      }),
    [plateHex, plateMap],
  );

  const plateSideMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: plateHex,
        roughness: 0.45,
        metalness: 0.7,
      }),
    [plateHex],
  );

  const plateZ = SOUND_BLOCK_BASE_D_IN / 2 + PLATE_T / 2;
  const tierYs = [baseY, midY, topY];

  return (
    <group>
      {TIERS.map((tier, i) => (
        <mesh
          key={i}
          geometry={tierGeoms[i]}
          position={[0, tierYs[i], 0]}
          material={bodyMat}
          castShadow
          receiveShadow
        />
      ))}
      <mesh position={[0, baseY, plateZ]} material={plateSideMat} castShadow>
        <boxGeometry args={[PLATE_W, PLATE_H, PLATE_T]} />
      </mesh>
      <mesh
        position={[0, baseY, plateZ + PLATE_T / 2 + 0.001]}
        material={plateMat}
      >
        <planeGeometry args={[PLATE_W * 0.97, PLATE_H * 0.9]} />
      </mesh>
    </group>
  );
}
