import * as THREE from "three";
import {
  GAVEL_BAND_DIAMETER_IN,
  GAVEL_BAND_HEIGHT_IN,
  GAVEL_HANDLE_LENGTH_IN,
  GAVEL_HEAD_DIAMETER_IN,
  GAVEL_HEAD_LENGTH_IN,
} from "~/constants/gavelStyles";

/**
 * Lathe profiles for the turned gavel, traced off the manufacturer's
 * dimensioned drawing. These live apart from the model component because the
 * stand placement solves the gavel's resting angle from the same silhouettes —
 * if the two ever disagreed, the gavel would hover or sink into the stand.
 */

export const HEAD_R = GAVEL_HEAD_DIAMETER_IN / 2;
export const HEAD_HALF = GAVEL_HEAD_LENGTH_IN / 2;
export const BAND_H = GAVEL_BAND_HEIGHT_IN;
/** Recessed below the wood beads, and the basis for the engraving wrap width. */
export const BAND_R = GAVEL_BAND_DIAMETER_IN / 2;
export const HANDLE_TENON = HEAD_R * 0.42;
/** Widest point of the shaft, measured off the drawing at 36.5% of head radius. */
export const HANDLE_MAX_R = HEAD_R * 0.365;

function v2(x: number, y: number) {
  return new THREE.Vector2(x, y);
}

/**
 * Half of the turned end cap. `u` runs 0 at the striking face to 1 at the edge
 * of the metal band, `r` is a fraction of the head radius — so the features stay
 * put if the head or band dimensions change.
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

/** Head silhouette, revolved about Y and centered on the origin. */
export function headProfilePoints(): THREE.Vector2[] {
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
 * exposed shaft in the drawing, so the standard length keeps the proportions.
 *
 * Y runs from the head center out to the tip, so the tenon is buried in the head.
 */
export function handleProfilePoints(exposedLengthIn: number): THREE.Vector2[] {
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

/** Distance from the head center to the tip of the handle. */
export const GAVEL_TIP_REACH_IN = HANDLE_TENON + GAVEL_HANDLE_LENGTH_IN;

export type GavelRestPose = {
  /** Radians the gavel tips so the handle slopes down, handle end low. */
  tiltRad: number;
  /** How far the head center sits above the stand's top face once it settles. */
  liftIn: number;
};

/**
 * Lowest point of the head once the gavel is tipped by `tilt`.
 *
 * The head is a surface of revolution about Y, so for every profile point the
 * lowest place on its circle is the one swung toward the handle.
 */
function lowestHeadY(profile: readonly THREE.Vector2[], tilt: number): number {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  let min = Infinity;
  for (const p of profile) min = Math.min(min, p.y * c - p.x * s);
  return min;
}

/** Lowest point of the handle, whose axis lies along the surface after tipping. */
function lowestHandleY(
  profile: readonly THREE.Vector2[],
  tilt: number,
): number {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  let min = Infinity;
  for (const p of profile) min = Math.min(min, -p.y * s - p.x * c);
  return min;
}

/**
 * How the gavel comes to rest on the stand: the head stands on its striking
 * face but rocks toward the handle until the handle's grip end touches too.
 *
 * The stand's two seating recesses drop each end by a different amount, so the
 * gavel lies flatter than it would on a bare surface — sinking the head further
 * than the tip takes tilt out of the handle. Passing 0 for both gives the
 * flat-surface pose.
 *
 * Solved from the real lathe silhouettes rather than eyeballed, so the gavel
 * keeps sitting flush if the turned profiles or the well depths change.
 * Bisection is safe because tipping only ever raises the head's contact and
 * lowers the handle's, so the difference crosses the target exactly once.
 */
export function gavelRestPoseInWells(
  headWellDepthIn: number,
  tipWellDepthIn: number,
): GavelRestPose {
  const head = headProfilePoints();
  const handle = handleProfilePoints(GAVEL_HANDLE_LENGTH_IN);
  const target = tipWellDepthIn - headWellDepthIn;
  const gap = (tilt: number) =>
    lowestHeadY(head, tilt) - lowestHandleY(handle, tilt);

  let lo = 0;
  let hi = Math.PI / 4;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) < target) lo = mid;
    else hi = mid;
  }
  const tiltRad = (lo + hi) / 2;
  return {
    tiltRad,
    liftIn: -headWellDepthIn - lowestHeadY(head, tiltRad),
  };
}
