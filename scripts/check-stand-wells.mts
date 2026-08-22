/**
 * Verifies the stand's seating recesses outside the browser.
 *
 * A recess is inside-out if its faces point away from the cavity, which reads as
 * a black hole in the render rather than a dimple, so this checks the sign of
 * every normal. It also confirms the holes in the top face line up with the
 * recess rims — a mismatch there leaves a visible crack around each well.
 *
 * Usage: npx vite-node scripts/check-stand-wells.mts
 */
import * as THREE from "three";
import {
  STAND_BEVEL_RISE_IN,
  STAND_BEVEL_RUN_IN,
  STAND_FOOT_H_IN,
  STAND_HEIGHT_IN,
  STAND_LEDGE_H_IN,
  STAND_LEDGE_PROJ_IN,
  STAND_LENGTH_IN,
  STAND_PLATE_ALONG_SLOPE,
  STAND_PLATE_H_IN,
  STAND_PLATE_KEYLINE_INSET_IN,
  STAND_PLATE_T_IN,
  STAND_PLATE_W_IN,
  STAND_WIDTH_IN,
  standBodyTopY,
  standFlatTopCenterZ,
  standLedgeFrontZ,
  standTopFrontZ,
} from "../app/constants/gavelStyles";
import { standPlateOutline } from "../app/utils/standPlateOutline";
import {
  STAND_WELLS,
  createStandBodyGeometry,
  createStandFooterGeometry,
  createStandPlateGeometry,
  createStandTopGeometry,
  createStandWellGeometry,
  wellRimPoints,
} from "../app/utils/standGeometry";

const topY = standBodyTopY();
const wellZ = standFlatTopCenterZ();
const problems: string[] = [];

for (const well of STAND_WELLS) {
  const geom = createStandWellGeometry(well);
  const pos = geom.getAttribute("position");
  const nor = geom.getAttribute("normal");

  let minY = Infinity;
  let maxY = -Infinity;
  let downward = 0;
  let nan = 0;

  for (let i = 0; i < pos.count; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
    const ny = nor.getY(i);
    if (!Number.isFinite(ny)) nan++;
    else if (ny < -1e-3) downward++;
  }

  const label = `${well.kind} well x=${well.x}`;
  console.log(
    `${label}: depth ${(topY - minY).toFixed(3)}" (want ${well.depth.toFixed(
      3,
    )}), ${pos.count} verts, ${downward} face down, ${nan} bad normals`,
  );

  if (Math.abs(topY - minY - well.depth) > 1e-4)
    problems.push(`${label} is the wrong depth`);
  if (Math.abs(maxY - topY) > 1e-4)
    problems.push(`${label} rim is off the top face`);
  if (downward > 0) problems.push(`${label} has ${downward} inside-out verts`);
  if (nan > 0) problems.push(`${label} has ${nan} invalid normals`);
  geom.dispose();
}

const top = createStandTopGeometry();
const topPos = top.getAttribute("position");
const topNor = top.getAttribute("normal");
let notUp = 0;
for (let i = 0; i < topNor.count; i++) {
  if (topNor.getY(i) < 0.999) notUp++;
}
if (notUp > 0) problems.push(`top face has ${notUp} verts not pointing straight up`);

let offPlane = 0;
for (let i = 0; i < topPos.count; i++) {
  if (Math.abs(topPos.getY(i) - topY) > 1e-6) offPlane++;
}
if (offPlane > 0) problems.push("top face is not flat");

// Every rim point the recesses were built from must also appear in the panel's
// hole, or the two meshes do not actually meet.
STAND_WELLS.forEach((well) => {
  let worst = 0;
  for (const rim of wellRimPoints(well)) {
    let nearest = Infinity;
    for (let i = 0; i < topPos.count; i++) {
      nearest = Math.min(
        nearest,
        Math.hypot(topPos.getX(i) - rim.x, topPos.getZ(i) - rim.y),
      );
    }
    worst = Math.max(worst, nearest);
  }
  console.log(
    `${well.kind} hole: rim points matched to within ${worst.toFixed(5)}"`,
  );
  if (worst > 1e-4) problems.push(`${well.kind} hole does not meet its rim`);
});

console.log(
  `top face: ${topPos.count} verts, ${offPlane} off the top plane, ${notUp} not facing up`,
);

const box = new THREE.Box3().setFromBufferAttribute(
  topPos as THREE.BufferAttribute,
);
console.log(
  `top face spans x ${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)} ` +
    `(stand ${(-STAND_LENGTH_IN / 2).toFixed(2)}..${(
      STAND_LENGTH_IN / 2
    ).toFixed(2)}), z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)} ` +
    `(width ${STAND_WIDTH_IN}, centered on ${wellZ.toFixed(2)})`,
);

const plate = createStandPlateGeometry();
const platePos = plate.getAttribute("position");
const plateUv = plate.getAttribute("uv");
const plateBox = new THREE.Box3().setFromBufferAttribute(
  platePos as THREE.BufferAttribute,
);
const plateSize = plateBox.getSize(new THREE.Vector3());
let badPlateUvs = 0;
for (let i = 0; i < plateUv.count; i++) {
  const u = plateUv.getX(i);
  const v = plateUv.getY(i);
  if (u < -1e-6 || u > 1.000001 || v < -1e-6 || v > 1.000001) badPlateUvs++;
}
console.log(
  `plate: ${plateSize.x.toFixed(3)} × ${plateSize.y.toFixed(3)} × ${plateSize.z.toFixed(3)}", ` +
    `${platePos.count} verts, ${badPlateUvs} UVs outside 0..1`,
);
if (
  Math.abs(plateSize.x - STAND_PLATE_W_IN) > 1e-4 ||
  Math.abs(plateSize.y - STAND_PLATE_H_IN) > 1e-4 ||
  Math.abs(plateSize.z - STAND_PLATE_T_IN) > 1e-4
)
  problems.push("plate has the wrong dimensions");
if (badPlateUvs) problems.push("plate has UVs outside the texture");
plate.dispose();

// The front angles down onto a wooden ledge; the photo puts the ledge at 21 px
// of the 104 px front, standing proud of the angled face by enough to show a
// shelf along its top.
const REF_LEDGE_FRAC = 21 / 104;
const ledgeFrac = STAND_LEDGE_H_IN / STAND_HEIGHT_IN;
console.log(
  `ledge: ${STAND_LEDGE_H_IN}" tall = ${ledgeFrac.toFixed(3)} of the body ` +
    `height (photo ${REF_LEDGE_FRAC.toFixed(3)}), standing ${STAND_LEDGE_PROJ_IN}" proud`,
);
if (Math.abs(ledgeFrac - REF_LEDGE_FRAC) > 0.03)
  problems.push("ledge is out of proportion with the stand");
if (STAND_LEDGE_PROJ_IN <= 0)
  problems.push("ledge sits flush with the angled face, so it will not read");

// Proportions read off the reference photo, as ratios so they survive the
// difference in camera angle between the photo and the render: the plate very
// nearly fills the angled face, centred top to bottom.
const REF_FILL = 0.847;
const REF_CENTER = 0.5;
const slopeLen = Math.hypot(STAND_BEVEL_RUN_IN, STAND_BEVEL_RISE_IN);
const fill = STAND_PLATE_H_IN / slopeLen;
const centerAlong = STAND_PLATE_ALONG_SLOPE * slopeLen;
const below = centerAlong - STAND_PLATE_H_IN / 2;
const above = slopeLen - centerAlong - STAND_PLATE_H_IN / 2;
console.log(
  `plate on face: fills ${fill.toFixed(3)} of the ${slopeLen.toFixed(3)}" slope ` +
    `(photo ${REF_FILL.toFixed(3)}), margins ${below.toFixed(3)}" below / ${above.toFixed(3)}" above`,
);
if (below < 0 || above < 0) problems.push("plate overhangs the sloped face");
if (Math.abs(fill - REF_FILL) > 0.03)
  problems.push("plate height is out of proportion with the sloped face");
if (Math.abs(STAND_PLATE_ALONG_SLOPE - REF_CENTER) > 0.03)
  problems.push("plate is not sitting where the photo puts it on the face");

// Width is measured against the stand length, which no camera angle distorts.
const REF_WIDTH_FRAC = 639 / 908;
const widthFrac = STAND_PLATE_W_IN / STAND_LENGTH_IN;
console.log(
  `plate width: ${widthFrac.toFixed(3)} of the stand length (photo ${REF_WIDTH_FRAC.toFixed(3)})`,
);
if (Math.abs(widthFrac - REF_WIDTH_FRAC) > 0.02)
  problems.push("plate width is out of proportion with the stand");

// The grain in the source maps runs along v, so the stand's length axis has to
// drive v or the front face ends up striped vertically.
const body = createStandBodyGeometry();
const bodyPos = body.getAttribute("position");
const bodyUv = body.getAttribute("uv");

// Every triangle has to land on one of the block's flat faces and look out of
// it. Sorting them by plane rather than by direction from the centre is what
// the ledge forces: its shelf faces up from below the block's mid height, so a
// centre-outward test reads it as inside-out when it is perfectly wound.
{
  const yLedge = STAND_FOOT_H_IN + STAND_LEDGE_H_IN;
  const yTop = STAND_FOOT_H_IN + STAND_HEIGHT_IN;
  const slope = new THREE.Vector3(
    0,
    STAND_BEVEL_RUN_IN,
    STAND_BEVEL_RISE_IN,
  ).normalize();
  const faces = [
    { name: "bottom", point: new THREE.Vector3(0, STAND_FOOT_H_IN, 0), normal: new THREE.Vector3(0, -1, 0), want: 2 },
    { name: "back", point: new THREE.Vector3(0, 0, -STAND_WIDTH_IN / 2), normal: new THREE.Vector3(0, 0, -1), want: 2 },
    { name: "slope", point: new THREE.Vector3(0, yTop, standTopFrontZ()), normal: slope, want: 2 },
    { name: "left end", point: new THREE.Vector3(-STAND_LENGTH_IN / 2, 0, 0), normal: new THREE.Vector3(-1, 0, 0), want: 3 },
    { name: "right end", point: new THREE.Vector3(STAND_LENGTH_IN / 2, 0, 0), normal: new THREE.Vector3(1, 0, 0), want: 3 },
  ];
  const counts = new Map(faces.map((f) => [f.name, 0]));
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let stray = 0;
  let inward = 0;
  for (let i = 0; i < bodyPos.count; i += 3) {
    a.fromBufferAttribute(bodyPos as THREE.BufferAttribute, i);
    b.fromBufferAttribute(bodyPos as THREE.BufferAttribute, i + 1);
    c.fromBufferAttribute(bodyPos as THREE.BufferAttribute, i + 2);
    const n = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    const centroid = new THREE.Vector3()
      .add(a)
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3);
    const face = faces.find(
      (f) =>
        Math.abs(centroid.clone().sub(f.point).dot(f.normal)) < 1e-6 &&
        Math.abs(Math.abs(n.dot(f.normal)) - 1) < 1e-6,
    );
    if (!face) stray++;
    else if (n.dot(face.normal) < 0) inward++;
    else counts.set(face.name, counts.get(face.name)! + 1);
  }
  console.log(
    `body: ${bodyPos.count / 3} tris, ${stray} off every face, ${inward} inside-out, ` +
      faces.map((f) => `${f.name} ${counts.get(f.name)}/${f.want}`).join(", "),
  );
  if (stray) problems.push("stand body has triangles off its flat faces");
  if (inward) problems.push("stand body has inward-facing triangles");
  for (const f of faces)
    if (counts.get(f.name) !== f.want)
      problems.push(`${f.name} face of the stand body is wrong`);
}
let duDx = 0;
let dvDx = 0;
for (let i = 0; i < bodyPos.count; i += 3) {
  for (const [a, b] of [
    [i, i + 1],
    [i + 1, i + 2],
  ]) {
    const dx = Math.abs(bodyPos.getX(a) - bodyPos.getX(b));
    if (dx < 1e-6) continue;
    duDx += Math.abs(bodyUv.getX(a) - bodyUv.getX(b)) / dx;
    dvDx += Math.abs(bodyUv.getY(a) - bodyUv.getY(b)) / dx;
  }
}
console.log(
  `grain: along the stand length, du/dx ${duDx.toFixed(2)} vs dv/dx ${dvDx.toFixed(2)}`,
);
if (dvDx <= duDx)
  problems.push("wood grain runs across the stand instead of along it");
body.dispose();

const footer = createStandFooterGeometry();
const footerBox = new THREE.Box3().setFromBufferAttribute(
  footer.getAttribute("position") as THREE.BufferAttribute,
);
const footerSize = footerBox.getSize(new THREE.Vector3());
console.log(
  `footer: ${footerSize.x.toFixed(3)} × ${footerSize.y.toFixed(3)} × ${footerSize.z.toFixed(3)}"`,
);
if (
  Math.abs(footerSize.x - STAND_LENGTH_IN) > 1e-4 ||
  Math.abs(footerSize.y - STAND_LEDGE_H_IN) > 1e-4 ||
  Math.abs(footerSize.z - STAND_LEDGE_PROJ_IN) > 1e-4
)
  problems.push("footer strip has the wrong dimensions");
footer.dispose();

// The keyline must stay inside the cut edge all the way round, including
// through the coves where a naive inset can cross back over the outline.
const edge = standPlateOutline();
const keyInset = STAND_PLATE_KEYLINE_INSET_IN;
const key = standPlateOutline(
  STAND_PLATE_W_IN / 2 - keyInset,
  STAND_PLATE_H_IN / 2 - keyInset,
);
let minGap = Infinity;
for (const k of key) {
  let d = Infinity;
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i];
    const b = edge[(i + 1) % edge.length];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 ? Math.max(0, Math.min(1, ((k.x - a.x) * vx + (k.y - a.y) * vy) / len2)) : 0;
    d = Math.min(d, Math.hypot(k.x - a.x - t * vx, k.y - a.y - t * vy));
  }
  minGap = Math.min(minGap, d);
}
console.log(
  `keyline: inset ${keyInset}", closest approach to the cut edge ${minGap.toFixed(4)}"`,
);
if (minGap < keyInset * 0.5)
  problems.push("keyline crowds the plate edge at the coves");

console.log(problems.length ? `PROBLEMS: ${problems.join("; ")}` : "OK");
