import * as THREE from "three";
import {
  STAND_BEVEL_RISE_IN,
  STAND_BEVEL_RUN_IN,
  STAND_FOOT_H_IN,
  STAND_HEAD_WELL_DEPTH_IN,
  STAND_HEAD_WELL_R_IN,
  STAND_HEAD_WELL_X_IN,
  STAND_HEIGHT_IN,
  STAND_LEDGE_H_IN,
  STAND_LEDGE_PROJ_IN,
  STAND_LENGTH_IN,
  STAND_PLATE_H_IN,
  STAND_PLATE_T_IN,
  STAND_PLATE_W_IN,
  STAND_TIP_WELL_DEPTH_IN,
  STAND_TIP_WELL_HALF_LEN_IN,
  STAND_TIP_WELL_HALF_W_IN,
  STAND_TIP_WELL_X_IN,
  STAND_WELL_FILLET_IN,
  STAND_WELL_TAPER_IN,
  STAND_WIDTH_IN,
  standBodyTopY,
  standFlatTopCenterZ,
  standFooterTopY,
  standLedgeFrontZ,
  standSlopeBottomZ,
  standTopFrontZ,
} from "~/constants/gavelStyles";
import { standPlateOutline } from "~/utils/standPlateOutline";

/** Inches of wood texture per UV tile. */
export const WOOD_TILE_IN = 6;

/**
 * Thin metal plaque from the product photos.
 *
 * The former box made the plate look like a plain rectangular tile. Extruding
 * the measured silhouette gives it the shouldered cove ends the real plaque
 * has, while normalized UVs let the keyline artwork meet the physical edge
 * exactly.
 */
export function createStandPlateGeometry(): THREE.BufferGeometry {
  const outline = standPlateOutline();
  const shape = new THREE.Shape();
  outline.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: STAND_PLATE_T_IN,
    bevelEnabled: false,
    curveSegments: 1,
  });
  // Center the extrusion on local Z, matching the old box transform.
  geom.translate(0, 0, -STAND_PLATE_T_IN / 2);

  const pos = geom.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / STAND_PLATE_W_IN + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / STAND_PLATE_H_IN + 0.5;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geom.computeVertexNormals();
  return geom;
}

/** A round hollow for the head; an oblong cove for the handle to bed into. */
export type StandWell =
  | { kind: "round"; x: number; radius: number; depth: number }
  | {
      kind: "groove";
      x: number;
      halfLength: number;
      halfWidth: number;
      depth: number;
    };

/** The two recesses the gavel settles into, head end first. */
export const STAND_WELLS: readonly StandWell[] = [
  {
    kind: "round",
    x: STAND_HEAD_WELL_X_IN,
    radius: STAND_HEAD_WELL_R_IN,
    depth: STAND_HEAD_WELL_DEPTH_IN,
  },
  {
    kind: "groove",
    x: STAND_TIP_WELL_X_IN,
    halfLength: STAND_TIP_WELL_HALF_LEN_IN,
    halfWidth: STAND_TIP_WELL_HALF_W_IN,
    depth: STAND_TIP_WELL_DEPTH_IN,
  },
];

const CAP_SEGS = 20;
const STRAIGHT_SEGS = 8;
const GROOVE_LEVELS = 10;

/**
 * The groove's cross-section is a circular cove. Its radius follows from the
 * depth and half-width rather than being set directly, which keeps the cove
 * meeting the top face exactly at the rim however those two are tuned.
 */
function coveRadius(halfWidth: number, depth: number): number {
  return (halfWidth * halfWidth + depth * depth) / (2 * depth);
}

/**
 * Outline at lateral distance `r` from the groove's centerline: a capsule
 * around the segment, which collapses onto the centerline itself at r = 0.
 *
 * Every ring uses the same section counts so rings at different depths line up
 * index for index and can simply be stitched together.
 */
function capsuleRing(well: StandWell & { kind: "groove" }, r: number) {
  const z = standFlatTopCenterZ();
  const xA = well.x - well.halfLength;
  const xB = well.x + well.halfLength;
  const pts: THREE.Vector2[] = [];

  for (let i = 0; i < CAP_SEGS; i++) {
    const a = -Math.PI / 2 + (i / CAP_SEGS) * Math.PI;
    pts.push(new THREE.Vector2(xB + r * Math.cos(a), z + r * Math.sin(a)));
  }
  for (let i = 0; i < STRAIGHT_SEGS; i++) {
    pts.push(
      new THREE.Vector2(xB + (xA - xB) * (i / STRAIGHT_SEGS), z + r),
    );
  }
  for (let i = 0; i < CAP_SEGS; i++) {
    const a = Math.PI / 2 + (i / CAP_SEGS) * Math.PI;
    pts.push(new THREE.Vector2(xA + r * Math.cos(a), z + r * Math.sin(a)));
  }
  for (let i = 0; i < STRAIGHT_SEGS; i++) {
    pts.push(
      new THREE.Vector2(xA + (xB - xA) * (i / STRAIGHT_SEGS), z - r),
    );
  }
  return pts;
}

/**
 * Where a recess breaks the top face. The hole in the flat panel and the
 * recess's own outer ring are both generated from this, so they share vertices
 * exactly and cannot leave a crack between them.
 */
export function wellRimPoints(well: StandWell): THREE.Vector2[] {
  if (well.kind === "groove") return capsuleRing(well, well.halfWidth);
  const z = standFlatTopCenterZ();
  const pts: THREE.Vector2[] = [];
  const segs = 72;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(
      new THREE.Vector2(
        well.x + well.radius * Math.cos(a),
        z + well.radius * Math.sin(a),
      ),
    );
  }
  return pts;
}

/**
 * Wood is projected onto whichever plane a face lies closest to, in inches.
 * Projecting every face onto XZ (as an earlier version did) smears the grain
 * into stripes on the two ends, where x never changes.
 *
 * The grain in the source maps runs down the image, along v, so the stand's
 * length axis has to be fed to v for the grain to run along the board. Feeding
 * it to u instead is what striped the front face vertically.
 */
type UvProjection = (p: THREE.Vector3) => [number, number];

function pushTri(
  positions: number[],
  uvs: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  uv: UvProjection,
) {
  for (const p of [a, b, c]) {
    positions.push(p.x, p.y, p.z);
    const [u, v] = uv(p);
    uvs.push(u, v);
  }
}

/** Winds the quad so its normal points along `outward`, whichever way it was given. */
function pushFace(
  positions: number[],
  uvs: number[],
  p00: THREE.Vector3,
  p10: THREE.Vector3,
  p11: THREE.Vector3,
  p01: THREE.Vector3,
  outward: THREE.Vector3,
  uv: UvProjection,
) {
  const n = new THREE.Vector3()
    .subVectors(p10, p00)
    .cross(new THREE.Vector3().subVectors(p01, p00));
  const flip = n.dot(outward) < 0;
  const a = flip ? p01 : p10;
  const b = flip ? p10 : p01;
  pushTri(positions, uvs, p00, a, p11, uv);
  pushTri(positions, uvs, p00, p11, b, uv);
}

/**
 * Grain is projected straight down onto every top surface, so it runs unbroken
 * from the flat face into the recesses the way it does in a routed board.
 */
function applyFlatWoodUvs(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geom.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getZ(i) / WOOD_TILE_IN;
    uv[i * 2 + 1] = pos.getX(i) / WOOD_TILE_IN;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geom;
}

/**
 * Main wood block: back, bottom, back-top, sloped front above the footer, and
 * end caps. The footer strip is a separate mesh in StandModel so it always
 * reads on the sloped-front preview (the old inset shelf was edge-on to the
 * plate camera and disappeared).
 */
export function createStandBodyGeometry(): THREE.BufferGeometry {
  const L = STAND_LENGTH_IN;
  const y0 = STAND_FOOT_H_IN;
  const yLedge = standFooterTopY();
  const y1 = y0 + STAND_HEIGHT_IN;
  const zBack = -STAND_WIDTH_IN / 2;
  const zSlopeBottom = standSlopeBottomZ();
  const zFrontTop = standTopFrontZ();
  const uvScale = 1 / WOOD_TILE_IN;

  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const topBackL = v(-L / 2, y1, zBack);
  const topBackR = v(L / 2, y1, zBack);
  const topFrontL = v(-L / 2, y1, zFrontTop);
  const topFrontR = v(L / 2, y1, zFrontTop);
  const slopeBotL = v(-L / 2, yLedge, zSlopeBottom);
  const slopeBotR = v(L / 2, yLedge, zSlopeBottom);
  const botBackL = v(-L / 2, y0, zBack);
  const botBackR = v(L / 2, y0, zBack);
  const botFrontL = v(-L / 2, y0, zSlopeBottom);
  const botFrontR = v(L / 2, y0, zSlopeBottom);

  const positions: number[] = [];
  const uvs: number[] = [];
  const down = v(0, -1, 0);
  const forward = v(0, 0, 1);
  const flat: UvProjection = (p) => [p.z * uvScale, p.x * uvScale];
  const lengthwise: UvProjection = (p) => [p.y * uvScale, p.x * uvScale];
  const endwise: UvProjection = (p) => [p.y * uvScale, p.z * uvScale];

  pushFace(positions, uvs, botBackL, botBackR, botFrontR, botFrontL, down, flat);
  pushFace(
    positions,
    uvs,
    botBackL,
    botBackR,
    topBackR,
    topBackL,
    v(0, 0, -1),
    lengthwise,
  );
  pushFace(
    positions,
    uvs,
    slopeBotL,
    slopeBotR,
    topFrontR,
    topFrontL,
    v(0, STAND_BEVEL_RUN_IN, STAND_BEVEL_RISE_IN),
    lengthwise,
  );

  for (const [side, sign] of [
    [[botBackL, botFrontL, slopeBotL, topFrontL, topBackL], -1],
    [[botBackR, botFrontR, slopeBotR, topFrontR, topBackR], 1],
  ] as [THREE.Vector3[], number][]) {
    for (let i = 1; i < side.length - 1; i++) {
      const [a, b, c] =
        sign < 0
          ? [side[0], side[i], side[i + 1]]
          : [side[0], side[i + 1], side[i]];
      pushTri(positions, uvs, a, b, c, endwise);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/** Footer strip below the sloped face — full-length block protruding forward. */
export function createStandFooterGeometry(): THREE.BufferGeometry {
  const yCenter = STAND_FOOT_H_IN + STAND_LEDGE_H_IN / 2;
  const zCenter = standSlopeBottomZ() + STAND_LEDGE_PROJ_IN / 2;
  const geom = new THREE.BoxGeometry(
    STAND_LENGTH_IN,
    STAND_LEDGE_H_IN,
    STAND_LEDGE_PROJ_IN,
  );
  geom.translate(0, yCenter, zCenter);
  return applyFlatWoodUvs(geom);
}

/**
 * The flat part of the top face, with a hole cut for each seating recess.
 *
 * An earlier version displaced a dense grid to dimple the surface instead. That
 * left the whole top faceted and the recess rims ragged, because a grid can only
 * approximate a circle. Cutting real holes keeps the flat area perfectly flat
 * and gives each recess a clean round edge.
 */
export function createStandTopGeometry(
  wells: readonly StandWell[] = STAND_WELLS,
): THREE.BufferGeometry {
  const L = STAND_LENGTH_IN;
  const zBack = -STAND_WIDTH_IN / 2;
  const zFrontTop = standTopFrontZ();

  // Shape space is (x, -z) so that rotating -90° about X lands it face up.
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, -zBack);
  shape.lineTo(L / 2, -zBack);
  shape.lineTo(L / 2, -zFrontTop);
  shape.lineTo(-L / 2, -zFrontTop);
  shape.closePath();

  for (const well of wells) {
    const hole = new THREE.Path();
    hole.setFromPoints(
      wellRimPoints(well).map((p) => new THREE.Vector2(p.x, -p.y)),
    );
    hole.closePath();
    shape.holes.push(hole);
  }

  const geom = new THREE.ShapeGeometry(shape, 64);
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, standBodyTopY(), 0);
  geom.computeVertexNormals();
  return applyFlatWoodUvs(geom);
}

export function createStandWellGeometry(
  well: StandWell,
): THREE.BufferGeometry {
  return well.kind === "groove"
    ? createGrooveGeometry(well)
    : createRoundWellGeometry(well);
}

/**
 * The handle's cove, swept along the groove's centerline.
 *
 * Built as nested capsule rings closing in on the centerline, each one sitting
 * at the depth its cross-section reaches at that distance out. The innermost
 * ring collapses onto the centerline, which puts the deepest line of the groove
 * exactly where the handle lies. Indexed and smooth-shaded, so the cove reads as
 * one continuous scoop.
 */
function createGrooveGeometry(
  well: StandWell & { kind: "groove" },
): THREE.BufferGeometry {
  const topY = standBodyTopY();
  const R = coveRadius(well.halfWidth, well.depth);
  const phiMax = Math.asin(Math.min(1, well.halfWidth / R));

  const positions: number[] = [];
  const ringSize = CAP_SEGS * 2 + STRAIGHT_SEGS * 2;

  for (let k = 0; k <= GROOVE_LEVELS; k++) {
    const phi = phiMax * (1 - k / GROOVE_LEVELS);
    const t = R * Math.sin(phi);
    const y = topY - (well.depth - R * (1 - Math.cos(phi)));
    for (const p of capsuleRing(well, t)) positions.push(p.x, y, p.y);
  }

  const indices: number[] = [];
  for (let k = 0; k < GROOVE_LEVELS; k++) {
    const a = k * ringSize;
    const b = (k + 1) * ringSize;
    for (let i = 0; i < ringSize; i++) {
      const j = (i + 1) % ringSize;
      indices.push(a + i, b + i, b + j);
      indices.push(a + i, b + j, a + j);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return applyFlatWoodUvs(geom);
}

/**
 * The head's hollow: a lightly drafted wall rolling over a filleted bottom edge
 * into a flat floor. Revolving the profile keeps the wall and floor smoothly
 * shaded, so the recess reads as a curved cut rather than a stack of facets.
 */
function createRoundWellGeometry(
  well: StandWell & { kind: "round" },
): THREE.BufferGeometry {
  const fillet = Math.min(STAND_WELL_FILLET_IN, well.depth * 0.6);
  const wallBottomY = -(well.depth - fillet);
  const wallBottomR = well.radius - STAND_WELL_TAPER_IN;
  const points: THREE.Vector2[] = [
    new THREE.Vector2(well.radius, 0),
    new THREE.Vector2(wallBottomR, wallBottomY),
  ];
  const segs = 5;
  for (let i = 1; i <= segs; i++) {
    const a = (i / segs) * (Math.PI / 2);
    points.push(
      new THREE.Vector2(
        wallBottomR - fillet * Math.sin(a),
        wallBottomY - fillet * (1 - Math.cos(a)),
      ),
    );
  }
  points.push(new THREE.Vector2(0, -well.depth));

  // Lathe winds a bottom-to-top profile to face outward, as for a solid. A
  // recess needs the opposite, so the profile runs rim-down-to-floor instead.
  const geom = new THREE.LatheGeometry(points, 72);
  geom.translate(well.x, standBodyTopY(), standFlatTopCenterZ());
  return applyFlatWoodUvs(geom);
}
