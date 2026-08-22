import * as THREE from "three";
import type { SoundBlockRing } from "~/constants/gavelStyles";

/** Inches of wood texture per UV tile. */
const WOOD_TILE_IN = 6;

function pushTri(
  positions: number[],
  uvs: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  uvA: readonly [number, number],
  uvB: readonly [number, number],
  uvC: readonly [number, number],
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
}

function pushQuad(
  positions: number[],
  uvs: number[],
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  uv0: readonly [number, number],
  uv1: readonly [number, number],
  uv2: readonly [number, number],
  uv3: readonly [number, number],
) {
  pushTri(positions, uvs, p0, p1, p2, uv0, uv1, uv2);
  pushTri(positions, uvs, p0, p2, p3, uv0, uv2, uv3);
}

/** Corner points of one profile ring, ordered -Z, +X, +Z, -X. */
function ringCorners(
  ring: SoundBlockRing,
  halfW: number,
  halfD: number,
): THREE.Vector3[] {
  const x = halfW - ring.inset;
  const z = halfD - ring.inset;
  return [
    new THREE.Vector3(-x, ring.y, -z),
    new THREE.Vector3(x, ring.y, -z),
    new THREE.Vector3(x, ring.y, z),
    new THREE.Vector3(-x, ring.y, z),
  ];
}

/**
 * Sweeps a sound block's edge profile around a rectangular footprint, so the
 * block is one continuous solid — the bullnose, shelf, and panel wall are bands
 * of the same surface rather than separate boxes stacked on each other.
 *
 * Grain runs horizontally around the sides and along X on the caps, matching
 * how the blocks are cut from a board in the product photos.
 *
 * The mesh is non-indexed, so computeVertexNormals leaves every band flat
 * shaded; the bullnose and top arris are subdivided finely enough that they
 * still read as round.
 */
export function createMoldedBlockGeometry(
  width: number,
  depth: number,
  rings: readonly SoundBlockRing[],
): THREE.BufferGeometry {
  const halfW = width / 2;
  const halfD = depth / 2;
  const s = 1 / WOOD_TILE_IN;
  const positions: number[] = [];
  const uvs: number[] = [];

  const levels = rings.map((ring) => ringCorners(ring, halfW, halfD));

  const bottom = levels[0];
  pushQuad(
    positions,
    uvs,
    bottom[0],
    bottom[1],
    bottom[2],
    bottom[3],
    [bottom[0].x * s, bottom[0].z * s],
    [bottom[1].x * s, bottom[1].z * s],
    [bottom[2].x * s, bottom[2].z * s],
    [bottom[3].x * s, bottom[3].z * s],
  );

  for (let r = 0; r < levels.length - 1; r++) {
    const lower = levels[r];
    const upper = levels[r + 1];
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      // Faces alternate between facing ±Z and ±X, so the horizontal texture
      // axis alternates with them.
      const across = (p: THREE.Vector3) => (k % 2 === 0 ? p.x : p.z);
      pushQuad(
        positions,
        uvs,
        lower[k],
        upper[k],
        upper[k1],
        lower[k1],
        [lower[k].y * s, across(lower[k]) * s],
        [upper[k].y * s, across(upper[k]) * s],
        [upper[k1].y * s, across(upper[k1]) * s],
        [lower[k1].y * s, across(lower[k1]) * s],
      );
    }
  }

  const top = levels[levels.length - 1];
  pushQuad(
    positions,
    uvs,
    top[0],
    top[3],
    top[2],
    top[1],
    [top[0].x * s, top[0].z * s],
    [top[3].x * s, top[3].z * s],
    [top[2].x * s, top[2].z * s],
    [top[1].x * s, top[1].z * s],
  );

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}
