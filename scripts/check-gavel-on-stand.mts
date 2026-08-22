/**
 * Checks the gavel's resting pose on the stand without a browser: applies the
 * real transform to the real lathe silhouettes and confirms each end settles to
 * the floor of its seating recess, that the gavel fits the stand's length, and
 * that the recesses are wide enough and placed where the gavel actually lands.
 * Also renders a side elevation to app/temp/gavel-on-stand.svg.
 *
 * Usage: npx vite-node scripts/check-gavel-on-stand.mts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import {
  GAVEL_HANDLE_LENGTH_IN,
  STAND_FOOT_H_IN,
  STAND_HEAD_WELL_DEPTH_IN,
  STAND_HEIGHT_IN,
  STAND_LENGTH_IN,
  STAND_TIP_WELL_DEPTH_IN,
  STAND_WELL_FILLET_IN,
  STAND_WELL_TAPER_IN,
  STAND_WIDTH_IN,
  gavelStandContactPoint,
  standBodyTopY,
  standFlatTopCenterZ,
  standTopFrontZ,
} from "../app/constants/gavelStyles";
import {
  gavelRestPoseInWells,
  handleProfilePoints,
  headProfilePoints,
} from "../app/utils/gavelProfiles";
import type { StandWell } from "../app/utils/standGeometry";
import { STAND_WELLS } from "../app/utils/standGeometry";

const rest = gavelRestPoseInWells(
  STAND_HEAD_WELL_DEPTH_IN,
  STAND_TIP_WELL_DEPTH_IN,
);
const contact = gavelStandContactPoint();
const topY = standBodyTopY();

const m = new THREE.Matrix4().compose(
  new THREE.Vector3(contact.x, contact.y + rest.liftIn, contact.z),
  new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, -Math.PI / 2, -rest.tiltRad, "ZYX"),
  ),
  new THREE.Vector3(1, 1, 1),
);

/** Sweeps a lathe profile into world space the way the renderer will. */
function sweep(
  profile: THREE.Vector2[],
  axis: "head" | "handle",
): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of profile) {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const local =
        axis === "head"
          ? new THREE.Vector3(p.x * Math.cos(a), p.y, p.x * Math.sin(a))
          : // Handle is turned about +Y then laid along -Z by the model.
            new THREE.Vector3(p.x * Math.cos(a), p.x * Math.sin(a), -p.y);
      out.push(local.applyMatrix4(m));
    }
  }
  return out;
}

const headPts = sweep(headProfilePoints(), "head");
const handlePts = sweep(handleProfilePoints(GAVEL_HANDLE_LENGTH_IN), "handle");
const all = [...headPts, ...handlePts];

const lowestHead = Math.min(...headPts.map((p) => p.y));
const lowestHandle = Math.min(...handlePts.map((p) => p.y));
const minX = Math.min(...all.map((p) => p.x));
const maxX = Math.max(...all.map((p) => p.x));
const minZ = Math.min(...all.map((p) => p.z));
const maxZ = Math.max(...all.map((p) => p.z));

const zFrontTop = standTopFrontZ();
const wellZ = standFlatTopCenterZ();
const problems: string[] = [];

console.log(`tilt              ${((rest.tiltRad * 180) / Math.PI).toFixed(2)}°`);
console.log(`head center lift  ${rest.liftIn.toFixed(3)}" above the top face`);
console.log(`stand top Y       ${topY.toFixed(3)}"`);
console.log(
  `head contact      ${(lowestHead - topY).toFixed(4)}" vs well floor ${(
    -STAND_HEAD_WELL_DEPTH_IN
  ).toFixed(4)}"`,
);
console.log(
  `handle contact    ${(lowestHandle - topY).toFixed(4)}" vs well floor ${(
    -STAND_TIP_WELL_DEPTH_IN
  ).toFixed(4)}"`,
);

/**
 * How deep the gavel cuts into each recess surface. Sizing the recesses by eye
 * is what let earlier versions clip the wood, so this walks every submerged
 * point and measures it against the actual routed shape rather than a bounding
 * radius: negative clearance anywhere means the gavel is passing through.
 */
function recessSurfaceY(well: StandWell, x: number, z: number): number {
  if (well.kind === "groove") {
    const xA = well.x - well.halfLength;
    const xB = well.x + well.halfLength;
    const t = Math.hypot(x - Math.min(xB, Math.max(xA, x)), z - wellZ);
    if (t >= well.halfWidth) return topY;
    const R = (well.halfWidth ** 2 + well.depth ** 2) / (2 * well.depth);
    return topY - (well.depth - R * (1 - Math.cos(Math.asin(t / R))));
  }
  const rho = Math.hypot(x - well.x, z - wellZ);
  if (rho >= well.radius) return topY;
  const fillet = Math.min(STAND_WELL_FILLET_IN, well.depth * 0.6);
  const wallBottomY = topY - (well.depth - fillet);
  const wallBottomR = well.radius - STAND_WELL_TAPER_IN;
  if (rho >= wallBottomR)
    return topY - (well.depth - fillet) * ((well.radius - rho) / STAND_WELL_TAPER_IN);
  if (rho >= wallBottomR - fillet) {
    const a = Math.asin((wallBottomR - rho) / fillet);
    return wallBottomY - fillet * (1 - Math.cos(a));
  }
  return topY - well.depth;
}

for (const [name, pts, well] of [
  ["head", headPts, STAND_WELLS[0]],
  ["tip ", handlePts, STAND_WELLS[1]],
] as const) {
  const below = pts.filter((p) => p.y < topY - 1e-6);
  if (!below.length) {
    console.log(`${name} recess       nothing below the surface`);
    continue;
  }
  let worst = Infinity;
  for (const p of below) {
    worst = Math.min(worst, p.y - recessSurfaceY(well, p.x, p.z));
  }
  const xs = below.map((p) => p.x);
  console.log(
    `${name} recess       ${below.length} pts below the surface, x ${Math.min(
      ...xs,
    ).toFixed(2)}..${Math.max(...xs).toFixed(2)}, clearance ${worst.toFixed(4)}"`,
  );
  if (worst < -0.002) problems.push(`${name.trim()} cuts into the recess wall`);
}

if (Math.abs(lowestHead - topY + STAND_HEAD_WELL_DEPTH_IN) > 0.005)
  problems.push("head does not sit on its well floor");
if (Math.abs(lowestHandle - topY + STAND_TIP_WELL_DEPTH_IN) > 0.005)
  problems.push("handle does not sit on its well floor");
if (minX < -STAND_LENGTH_IN / 2 || maxX > STAND_LENGTH_IN / 2)
  problems.push("gavel overhangs the ends of the stand");
if (minZ < -STAND_WIDTH_IN / 2 || maxZ > zFrontTop)
  problems.push("gavel overhangs the front or back of the top face");
console.log(problems.length ? `PROBLEMS: ${problems.join("; ")}` : "OK");

const S = 70;
const PAD = 26;
const H = STAND_FOOT_H_IN + STAND_HEIGHT_IN + 3.4;
const iw = Math.round(STAND_LENGTH_IN * S) + PAD * 2;
const ih = Math.round(H * S) + PAD * 2;
const px = (x: number) => PAD + (x + STAND_LENGTH_IN / 2) * S;
const py = (y: number) => ih - PAD - y * S;

const dots = all
  .filter((_, i) => i % 7 === 0)
  .map((p) => `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="1" fill="#7a5540"/>`)
  .join("");

/** The stand's top edge sliced down the middle, dipping through each recess. */
const outline = [`M ${px(-STAND_LENGTH_IN / 2)} ${py(topY)}`];
for (const well of STAND_WELLS) {
  const reach =
    well.kind === "groove" ? well.halfLength + well.halfWidth : well.radius;
  for (let i = 0; i <= 60; i++) {
    const x = well.x - reach + (2 * reach * i) / 60;
    outline.push(`L ${px(x)} ${py(recessSurfaceY(well, x, wellZ))}`);
  }
}
outline.push(`L ${px(STAND_LENGTH_IN / 2)} ${py(topY)}`);
outline.push(`L ${px(STAND_LENGTH_IN / 2)} ${py(STAND_FOOT_H_IN)}`);
outline.push(`L ${px(-STAND_LENGTH_IN / 2)} ${py(STAND_FOOT_H_IN)} Z`);

writeFileSync(
  path.resolve(process.cwd(), "app/temp/gavel-on-stand.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">
<rect width="100%" height="100%" fill="#f4f2ee"/>
<path d="${outline.join(" ")}" fill="#5c3d2e"/>
<line x1="0" x2="${iw}" y1="${py(topY).toFixed(1)}" y2="${py(topY).toFixed(1)}" stroke="#c0392b" stroke-width="1" stroke-dasharray="4 4"/>
${dots}
</svg>`,
);
console.log("wrote app/temp/gavel-on-stand.svg");
