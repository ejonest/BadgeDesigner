import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import type { GavelHandleLengthId, GavelStyleDef } from "~/constants/gavelStyles";
import {
  GAVEL_BAND_GOLD_HEX,
  GAVEL_HANDLE_LENGTH_IN,
  GAVEL_HEAD_DIAMETER_IN,
  GAVEL_HEAD_LENGTH_IN,
  GAVEL_BAND_HEIGHT_IN,
} from "~/constants/gavelStyles";

type Props = {
  style: GavelStyleDef;
  bandTextureUrl: string;
  bandHex?: string;
  handleLength?: GavelHandleLengthId;
};

const HEAD_R = GAVEL_HEAD_DIAMETER_IN / 2;
const HEAD_HALF = GAVEL_HEAD_LENGTH_IN / 2;
const BAND_H = GAVEL_BAND_HEIGHT_IN;
/** Band sits slightly inset of the large beads, flush with the inner beads. */
const BAND_R = HEAD_R * 0.96;
const HANDLE_TENON = HEAD_R * 0.95;

function v2(x: number, y: number) {
  return new THREE.Vector2(x, y);
}

/**
 * Photo-matched head: dome → large bead → deep groove → small bead → band.
 * Striking faces at ±HEAD_HALF; band centered on Y.
 */
function headProfilePoints(): THREE.Vector2[] {
  const R = HEAD_R;
  const H = HEAD_HALF;
  const BH = BAND_H / 2;
  const lower = [
    v2(0.001, -H),
    v2(R * 0.42, -H + 0.01),
    v2(R * 0.78, -H + 0.06),
    v2(R * 0.92, -H + 0.12),
    // large outer bead
    v2(R * 0.98, -H + 0.2),
    v2(R * 1.0, -H + 0.3),
    v2(R * 0.97, -H + 0.38),
    // deep groove
    v2(R * 0.74, -H + 0.46),
    v2(R * 0.64, -H + 0.52),
    v2(R * 0.72, -H + 0.58),
    // small bead bordering the band
    v2(R * 0.92, -H + 0.66),
    v2(R * 0.98, -BH - 0.06),
    v2(R * 0.97, -BH - 0.02),
    v2(BAND_R, -BH),
    // recessed band channel
    v2(BAND_R * 0.995, -BH + 0.01),
    v2(BAND_R * 0.995, BH - 0.01),
    v2(BAND_R, BH),
  ];
  const upper = lower
    .slice(0, -3)
    .reverse()
    .map((p) => v2(p.x, -p.y));
  return [...lower, ...upper];
}

function handleProfilePoints(exposedLengthIn: number): THREE.Vector2[] {
  const t = HANDLE_TENON;
  const L = t + exposedLengthIn;
  return [
    v2(0.11, 0),
    v2(0.11, t - 0.05),
    // small bead at the head
    v2(0.18, t),
    v2(0.22, t + 0.07),
    // large collar
    v2(0.3, t + 0.16),
    v2(0.34, t + 0.26),
    v2(0.28, t + 0.36),
    // thin ring
    v2(0.19, t + 0.42),
    v2(0.23, t + 0.48),
    v2(0.17, t + 0.55),
    v2(0.155, t + 0.7),
    // mid bead ~1/4 down the exposed shaft
    v2(0.15, t + exposedLengthIn * 0.22),
    v2(0.22, t + exposedLengthIn * 0.28),
    v2(0.15, t + exposedLengthIn * 0.34),
    v2(0.145, L - 0.78),
    v2(0.15, L - 0.55),
    // tip bead + pointed finial
    v2(0.2, L - 0.4),
    v2(0.23, L - 0.3),
    v2(0.16, L - 0.16),
    v2(0.07, L - 0.06),
    v2(0.018, L),
    v2(0.001, L),
  ];
}

function makeWoodMap(style: GavelStyleDef): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = style.bodyColor;
  ctx.fillRect(0, 0, size, size);

  if (!style.useWoodGrain) {
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.01 + (i % 5) * 0.008})`;
      ctx.fillRect(0, (i / 50) * size, size, 2);
    }
  } else {
    const isOak = style.id === "oak";
    const lines = isOak ? 42 : 78;
    for (let i = 0; i < lines; i++) {
      const x = (i / lines) * size + Math.sin(i * 0.65) * (isOak ? 22 : 7);
      ctx.strokeStyle = style.grainTint;
      ctx.globalAlpha = isOak ? 0.18 + (i % 3) * 0.07 : 0.11 + (i % 5) * 0.045;
      ctx.lineWidth = isOak ? 2.5 + (i % 6) : 1.2 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= size; y += 6) {
        ctx.lineTo(
          x + Math.sin(y * (isOak ? 0.022 : 0.038) + i) * (isOak ? 18 : 8),
          y,
        );
      }
      ctx.stroke();
    }
    if (isOak) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = "#fff4dc";
      for (let i = 0; i < 10; i++) {
        ctx.fillRect(50 + i * 92, 0, 5, size);
      }
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeBrushedBandMap(hex: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const w = 512;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + (i % 4) * 0.015})`;
    ctx.fillRect(0, (i / 90) * h, w, 1.2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Lathe-turned gavel matching Gavels Fast product photos:
 * same head on every SKU, handle length varies, wood + band materials swap.
 * Stands on a striking face (Y up); handle extends −Z.
 */
export function GavelModel({
  style,
  bandTextureUrl,
  bandHex = GAVEL_BAND_GOLD_HEX,
  handleLength = "standard",
}: Props) {
  const handleIn = GAVEL_HANDLE_LENGTH_IN[handleLength];

  const headGeom = useMemo(
    () => new THREE.LatheGeometry(headProfilePoints(), 96),
    [],
  );
  const handleGeom = useMemo(
    () => new THREE.LatheGeometry(handleProfilePoints(handleIn), 48),
    [handleIn],
  );

  const bandMap = useMemo(() => {
    if (!bandTextureUrl) return makeBrushedBandMap(bandHex);
    const loader = new THREE.TextureLoader();
    const tex = loader.load(bandTextureUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    return tex;
  }, [bandTextureUrl, bandHex]);

  const woodMap = useMemo(() => makeWoodMap(style), [style]);

  useLayoutEffect(() => {
    return () => {
      bandMap?.dispose();
      woodMap?.dispose();
    };
  }, [bandMap, woodMap]);

  useLayoutEffect(() => {
    return () => handleGeom.dispose();
  }, [handleGeom]);

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: woodMap ? "#ffffff" : style.bodyColor,
        roughness: style.roughness,
        metalness: style.metalness,
        map: woodMap ?? undefined,
        envMapIntensity: style.id === "ebony" ? 0.85 : 0.65,
      }),
    [style.bodyColor, style.id, style.metalness, style.roughness, woodMap],
  );

  const bandMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: bandMap ? "#ffffff" : bandHex,
        roughness: 0.28,
        metalness: 0.9,
        map: bandMap ?? undefined,
        envMapIntensity: 1.4,
      }),
    [bandHex, bandMap],
  );

  return (
    <group>
      <mesh geometry={headGeom} material={bodyMat} castShadow receiveShadow />
      <mesh rotation={[0, Math.PI, 0]} material={bandMat} castShadow>
        <cylinderGeometry
          args={[BAND_R * 1.012, BAND_R * 1.012, BAND_H * 0.97, 96, 1, true]}
        />
      </mesh>
      {/* Lathe along +Y, then −90° X so the tip goes −Z. Tenon sits inside the head. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={handleGeom} material={bodyMat} castShadow />
      </group>
    </group>
  );
}

export function gavelGroundY(): number {
  return -HEAD_HALF;
}
