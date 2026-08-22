import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import type { GavelStyleDef } from "~/constants/gavelStyles";
import {
  STAND_BEVEL_RISE_IN,
  STAND_BEVEL_RUN_IN,
  STAND_FOOT_H_IN,
  STAND_HEIGHT_IN,
  STAND_LEDGE_H_IN,
  STAND_LEDGE_PROJ_IN,
  STAND_LENGTH_IN,
  STAND_PLATE_ALONG_SLOPE,
  STAND_PLATE_CORNER_R_IN,
  STAND_PLATE_H_IN,
  STAND_PLATE_T_IN,
  STAND_PLATE_W_IN,
  STAND_WIDTH_IN,
  standFooterTopY,
  standLedgeFrontZ,
  standSlopeBottomZ,
  standTopFrontZ,
} from "~/constants/gavelStyles";
import { useLoadedWoodMaps } from "~/components/gavel/GavelModel";
import {
  STAND_WELLS,
  WOOD_TILE_IN,
  createStandBodyGeometry,
  createStandFooterGeometry,
  createStandPlateGeometry,
  createStandTopGeometry,
  createStandWellGeometry,
} from "~/utils/standGeometry";

type Props = {
  style: GavelStyleDef;
  /**
   * Live plate artwork. Taking the canvas rather than a PNG data URL keeps
   * encode and image-decode work off the path from an edit to the screen, which
   * matters while the logo sliders are being dragged.
   */
  plateCanvas?: HTMLCanvasElement | null;
  /** Bumped by the owner after each repaint, to re-upload the texture. */
  plateCanvasVersion?: number;
  plateHex: string;
};

const FOOT_W = 0.34;
const FOOT_D = 0.28;
const FOOT_INSET = 0.14;

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

/** Place the plate on the sloped face above the footer strip. */
function plateTransform() {
  const yLedge = standFooterTopY();
  const yTop = STAND_FOOT_H_IN + STAND_HEIGHT_IN;
  const zBottom = standSlopeBottomZ();
  const zTop = standTopFrontZ();
  const angle = Math.atan2(STAND_BEVEL_RUN_IN, STAND_BEVEL_RISE_IN);
  const inset = STAND_PLATE_T_IN / 2 + 0.008;
  const t = STAND_PLATE_ALONG_SLOPE;
  return {
    position: [
      0,
      yLedge + (yTop - yLedge) * t + Math.sin(angle) * inset,
      zBottom + (zTop - zBottom) * t + Math.cos(angle) * inset,
    ] as const,
    rotation: [-angle, 0, 0] as const,
  };
}

const BODY_DEPS = [
  STAND_LENGTH_IN,
  STAND_WIDTH_IN,
  STAND_HEIGHT_IN,
  STAND_LEDGE_H_IN,
  STAND_LEDGE_PROJ_IN,
  STAND_BEVEL_RUN_IN,
  STAND_BEVEL_RISE_IN,
  STAND_FOOT_H_IN,
] as const;

export function StandModel({
  style,
  plateCanvas = null,
  plateCanvasVersion = 0,
  plateHex,
}: Props) {
  const woodMaps = useLoadedWoodMaps(style);
  const bodyGeom = useMemo(() => createStandBodyGeometry(), [...BODY_DEPS]);
  const footerGeom = useMemo(() => createStandFooterGeometry(), [...BODY_DEPS]);
  const topGeom = useMemo(() => createStandTopGeometry(), [...BODY_DEPS]);
  const plateGeom = useMemo(
    () => createStandPlateGeometry(),
    [STAND_PLATE_W_IN, STAND_PLATE_H_IN, STAND_PLATE_CORNER_R_IN, STAND_PLATE_T_IN],
  );
  const wellGeoms = useMemo(
    () => STAND_WELLS.map(createStandWellGeometry),
    [STAND_LENGTH_IN, STAND_WIDTH_IN, STAND_HEIGHT_IN],
  );
  const plateXf = useMemo(
    () => plateTransform(),
    [
      STAND_PLATE_ALONG_SLOPE,
      STAND_PLATE_T_IN,
      STAND_BEVEL_RUN_IN,
      STAND_BEVEL_RISE_IN,
      STAND_FOOT_H_IN,
      STAND_HEIGHT_IN,
      STAND_LEDGE_H_IN,
      STAND_LEDGE_PROJ_IN,
    ],
  );
  const isWhite = plateHex.trim().toLowerCase() === "#ffffff";

  useLayoutEffect(() => {
    return () => {
      bodyGeom.dispose();
      footerGeom.dispose();
      topGeom.dispose();
      plateGeom.dispose();
      for (const g of wellGeoms) g.dispose();
    };
  }, [bodyGeom, footerGeom, plateGeom, topGeom, wellGeoms]);

  const plateMap = useMemo(() => {
    if (!plateCanvas) return null;
    const tex = new THREE.CanvasTexture(plateCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [plateCanvas]);

  useLayoutEffect(() => {
    return () => plateMap?.dispose();
  }, [plateMap]);

  // The canvas is repainted in place, so the texture only needs re-uploading.
  useLayoutEffect(() => {
    if (plateMap) plateMap.needsUpdate = true;
  }, [plateMap, plateCanvasVersion]);

  const tiledColor = useMemo(
    () =>
      cloneTiledMap(
        woodMaps.map,
        STAND_LENGTH_IN / WOOD_TILE_IN,
        STAND_WIDTH_IN / WOOD_TILE_IN,
      ),
    [woodMaps.map],
  );
  const tiledNormal = useMemo(
    () =>
      cloneTiledMap(
        woodMaps.normalMap,
        STAND_LENGTH_IN / WOOD_TILE_IN,
        STAND_WIDTH_IN / WOOD_TILE_IN,
      ),
    [woodMaps.normalMap],
  );
  const tiledRough = useMemo(
    () =>
      cloneTiledMap(
        woodMaps.roughnessMap,
        STAND_LENGTH_IN / WOOD_TILE_IN,
        STAND_WIDTH_IN / WOOD_TILE_IN,
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
        roughness: isWhite ? 0.38 : 0.42,
        metalness: isWhite ? 0.12 : 0.78,
        map: plateMap ?? undefined,
      }),
    [isWhite, plateHex, plateMap],
  );

  const footMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1d1b19",
        roughness: 0.85,
        metalness: 0,
      }),
    [],
  );

  const footX = STAND_LENGTH_IN / 2 - FOOT_INSET - FOOT_W / 2;
  const footZ = standLedgeFrontZ() - FOOT_INSET - FOOT_D / 2;
  const feet: readonly (readonly [number, number])[] = [
    [-footX, -footZ],
    [footX, -footZ],
    [-footX, footZ],
    [footX, footZ],
  ];

  return (
    <group>
      <mesh geometry={bodyGeom} material={bodyMat} castShadow receiveShadow />
      <mesh geometry={footerGeom} material={bodyMat} castShadow receiveShadow />
      <mesh geometry={topGeom} material={bodyMat} receiveShadow />
      {wellGeoms.map((geom, i) => (
        <mesh
          key={STAND_WELLS[i].x}
          geometry={geom}
          material={bodyMat}
          receiveShadow
        />
      ))}
      {feet.map(([x, z]) => (
        <mesh
          key={`${x}:${z}`}
          position={[x, STAND_FOOT_H_IN / 2, z]}
          material={footMat}
          castShadow
        >
          <boxGeometry args={[FOOT_W, STAND_FOOT_H_IN, FOOT_D]} />
        </mesh>
      ))}
      <mesh
        position={[...plateXf.position]}
        rotation={[...plateXf.rotation]}
        geometry={plateGeom}
        material={plateMat}
        castShadow
      />
    </group>
  );
}
