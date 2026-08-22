/**
 * Sanity-checks the sound block against the product photos without a browser:
 * confirms every face of the swept solid points outward (the bullnose reverses
 * the profile's slope, which is easy to get wrong), reports the proportions to
 * compare against the photos, and renders the cross-section to
 * app/temp/sound-block-profile.png.
 *
 * Usage: npx vite-node scripts/check-sound-block.mts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import {
  SOUND_BLOCK_D_IN,
  SOUND_BLOCK_FOOT_H_IN,
  SOUND_BLOCK_H_IN,
  SOUND_BLOCK_PROFILE,
  SOUND_BLOCK_TOP_FACE_W_IN,
  SOUND_BLOCK_W_IN,
} from "../app/constants/gavelStyles";
import { createMoldedBlockGeometry } from "../app/utils/soundBlockGeometry";

const geom = createMoldedBlockGeometry(
  SOUND_BLOCK_W_IN,
  SOUND_BLOCK_D_IN,
  SOUND_BLOCK_PROFILE,
);

const pos = geom.getAttribute("position");
const nor = geom.getAttribute("normal");
const center = new THREE.Vector3(0, SOUND_BLOCK_H_IN / 2, 0);

let inverted = 0;
let degenerate = 0;
for (let t = 0; t < pos.count; t += 3) {
  const a = new THREE.Vector3().fromBufferAttribute(pos, t);
  const b = new THREE.Vector3().fromBufferAttribute(pos, t + 1);
  const c = new THREE.Vector3().fromBufferAttribute(pos, t + 2);
  const n = new THREE.Vector3().fromBufferAttribute(nor, t);
  if (n.lengthSq() < 1e-8) {
    degenerate++;
    continue;
  }
  const outward = a.clone().add(b).add(c).divideScalar(3).sub(center);
  if (n.dot(outward) < 0) inverted++;
}

console.log(`triangles         ${pos.count / 3}`);
console.log(`inverted normals  ${inverted}`);
console.log(`degenerate faces  ${degenerate}`);
console.log(
  `height            ${SOUND_BLOCK_H_IN.toFixed(3)}" + ${SOUND_BLOCK_FOOT_H_IN}" feet`,
);
console.log(
  `height / width    ${(SOUND_BLOCK_H_IN / SOUND_BLOCK_W_IN).toFixed(3)}`,
);
console.log(
  `top face          ${SOUND_BLOCK_TOP_FACE_W_IN.toFixed(3)}" (${(
    (SOUND_BLOCK_TOP_FACE_W_IN / SOUND_BLOCK_W_IN) *
    100
  ).toFixed(1)}% of width)`,
);

const widest = Math.min(...SOUND_BLOCK_PROFILE.map((r) => r.inset));
const bodyInset = SOUND_BLOCK_PROFILE[1].inset;
console.log(`molding overhang  ${(bodyInset - widest).toFixed(3)}" per side`);

const S = 300;
const PAD = 34;
const W = SOUND_BLOCK_W_IN;
const H = SOUND_BLOCK_H_IN + SOUND_BLOCK_FOOT_H_IN;
const iw = Math.round(W * S) + PAD * 2;
const ih = Math.round(H * S) + PAD * 2;
const px = (x: number) => PAD + (x + W / 2) * S;
const py = (y: number) => ih - PAD - (y + SOUND_BLOCK_FOOT_H_IN) * S;

const right = SOUND_BLOCK_PROFILE.map(
  (r) => `${px(W / 2 - r.inset).toFixed(1)},${py(r.y).toFixed(1)}`,
);
const left = [...SOUND_BLOCK_PROFILE]
  .reverse()
  .map((r) => `${px(-(W / 2 - r.inset)).toFixed(1)},${py(r.y).toFixed(1)}`);

const footX = W / 2 - 0.3;
const foot = (x: number) =>
  `<rect x="${px(x - 0.11).toFixed(1)}" y="${py(0).toFixed(1)}" width="${(
    0.22 * S
  ).toFixed(1)}" height="${(SOUND_BLOCK_FOOT_H_IN * S).toFixed(1)}" fill="#1d1b19"/>`;

writeFileSync(
  path.resolve(process.cwd(), "app/temp/sound-block-profile.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">
<rect width="100%" height="100%" fill="#f2f2f2"/>
${foot(-footX)}${foot(footX)}
<polygon points="${[...left, ...right].join(" ")}" fill="#6a4736" stroke="#2b1a12" stroke-width="2"/>
</svg>`,
);
console.log("wrote app/temp/sound-block-profile.svg");
