import {
  STAND_PLATE_CORNER_R_IN,
  STAND_PLATE_H_IN,
  STAND_PLATE_W_IN,
} from "~/constants/gavelStyles";

export type PlatePoint = { x: number; y: number };

/** Samples per corner arc; enough that the curve reads smooth at any preview size. */
const CORNER_SEGS = 12;

/**
 * The plaque's silhouette in inches, centred on the origin with +y up.
 *
 * Each corner is a concave quarter arc centred on the bounding-box corner,
 * cutting inward so the top and bottom edges run nearly full width. The
 * previous shoulder-and-cove profile indented the sides instead, which made
 * the plate read as a pinched rectangle rather than the notched corners in
 * the product photos.
 *
 * The 3D silhouette and the printed keyline are both generated from this, so
 * the artwork cannot drift out of register with the physical edge.
 */
export function standPlateOutline(
  halfW: number = STAND_PLATE_W_IN / 2,
  halfH: number = STAND_PLATE_H_IN / 2,
  cornerR: number = STAND_PLATE_CORNER_R_IN,
): PlatePoint[] {
  const r = Math.min(cornerR, halfW * 0.22, halfH * 0.42);
  const pts: PlatePoint[] = [];

  /** Concave notch centred on a bounding-box corner. */
  const corner = (cx: number, cy: number, startAngle: number, endAngle: number) => {
    for (let i = 0; i <= CORNER_SEGS; i++) {
      const a = startAngle + (i / CORNER_SEGS) * (endAngle - startAngle);
      pts.push({
        x: cx + r * Math.cos(a),
        y: cy + r * Math.sin(a),
      });
    }
  };

  pts.push({ x: -halfW + r, y: halfH });
  pts.push({ x: halfW - r, y: halfH });
  corner(halfW, halfH, Math.PI, (3 * Math.PI) / 2);
  pts.push({ x: halfW, y: -halfH + r });
  corner(halfW, -halfH, Math.PI / 2, Math.PI);
  pts.push({ x: -halfW + r, y: -halfH });
  corner(-halfW, -halfH, 0, Math.PI / 2);
  pts.push({ x: -halfW, y: halfH - r });
  corner(-halfW, halfH, (3 * Math.PI) / 2, 2 * Math.PI);
  return pts;
}
