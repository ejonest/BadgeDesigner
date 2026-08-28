import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GavelModel } from "~/components/gavel/GavelModel";
import { SoundBlockModel } from "~/components/gavel/SoundBlockModel";
import { StandModel } from "~/components/gavel/StandModel";
import type { GavelStyleDef } from "~/constants/gavelStyles";
import {
  GAVEL_BAND_GOLD_HEX,
  GAVEL_VIEW_CAMERA_POSITION,
  GAVEL_VIEW_TARGET,
  SOUND_BLOCK_VIEW_CAMERA_POSITION,
  SOUND_BLOCK_VIEW_TARGET,
  STAND_HEAD_WELL_DEPTH_IN,
  STAND_TIP_WELL_DEPTH_IN,
  STAND_VIEW_CAMERA_POSITION,
  STAND_VIEW_TARGET,
  STAND_GEOMETRY_REVISION,
  gavelGroundY,
  gavelStandContactPoint,
  soundBlockGroundY,
  standGroundY,
} from "~/constants/gavelStyles";
import { gavelRestPoseInWells } from "~/utils/gavelProfiles";

/**
 * Reflection/IBL strength for the whole model. This has to live on the
 * Environment rather than per material: three.js replaces a material's
 * envMapIntensity with scene.environmentIntensity whenever the material has no
 * envMap of its own, which is the case for everything here.
 *
 * This, not the ambient lights, is what sets how bright the model reads: it
 * scales the diffuse half of the IBL too, so raising it lifts the wood far more
 * per unit than ambientLight does. Turning it down to tame the band's highlight
 * only made the whole scene murky — the highlight belongs to the band's own
 * metalness, and is handled there.
 */
const GAVEL_ENV_INTENSITY = 0.62;

/**
 * How the gavel lies on the stand, as in the product photos: turned a quarter
 * so the handle runs down the stand's length, then tipped until it settles into
 * the two seating recesses. The ZYX order matters — the tip has to happen in
 * world space, after the quarter turn.
 */
const STAND_REST = gavelRestPoseInWells(
  STAND_HEAD_WELL_DEPTH_IN,
  STAND_TIP_WELL_DEPTH_IN,
);
const STAND_CONTACT = gavelStandContactPoint();

export type GavelPreviewSubject =
  | "gavel"
  | "soundBlock"
  | "stand"
  | "plate"
  | "product"
  | "band";

export type GavelSpinPreviewHandle = {
  capturePngDataUrl: () => string | null;
  capturePngBlob: () => Promise<Blob | null>;
};

export type GavelSpinPreviewProps = {
  style: GavelStyleDef;
  bandTextureUrl: string;
  bandHex?: string;
  className?: string;
  /** Personalized sound-block top art; toggle is shown when this is set. */
  soundBlockTextureUrl?: string;
  soundBlockShape?: "square" | "round";
  showSoundBlockToggle?: boolean;
  /**
   * Live stand-plate art for the 3D plaque. A canvas rather than a data URL, so
   * edits reach the mesh without a PNG encode and image decode in between.
   */
  plateCanvas?: HTMLCanvasElement | null;
  /** Bumped by the owner after each repaint of `plateCanvas`. */
  plateCanvasVersion?: number;
  /** Same art cut to the plaque silhouette, shown flat on the Plate tab. */
  plateProofUrl?: string;
  plateHex?: string;
  showStandToggle?: boolean;
  /**
   * Whether to offer the flat band/plate proofs as tabs. Desktop renders the
   * same proofs as strips under the preview, so the tabs would be a duplicate
   * of what is already on screen; mobile hides those strips and needs them.
   */
  showFlatProofTabs?: boolean;
  /** Studio photo of the real product for the selected wood. */
  productPhotoSrc?: string;
};

function CaptureBridge({
  glRef,
}: {
  glRef: MutableRefObject<THREE.WebGLRenderer | null>;
}) {
  const { gl } = useThree();
  useLayoutEffect(() => {
    glRef.current = gl;
  }, [gl, glRef]);
  return null;
}

type CameraSubject = GavelPreviewSubject;

function FrameView({ subject }: { subject: CameraSubject }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const pos =
      subject === "soundBlock"
        ? SOUND_BLOCK_VIEW_CAMERA_POSITION
        : subject === "stand"
          ? STAND_VIEW_CAMERA_POSITION
          : GAVEL_VIEW_CAMERA_POSITION;
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.updateProjectionMatrix();
  }, [camera, subject]);
  return null;
}

export const GavelSpinPreview = forwardRef<
  GavelSpinPreviewHandle,
  GavelSpinPreviewProps
>(function GavelSpinPreview(
  {
    style,
    bandTextureUrl,
    bandHex = GAVEL_BAND_GOLD_HEX,
    className = "",
    soundBlockTextureUrl = "",
    soundBlockShape = "square",
    showSoundBlockToggle = false,
    plateCanvas = null,
    plateCanvasVersion = 0,
    plateProofUrl = "",
    plateHex = GAVEL_BAND_GOLD_HEX,
    showStandToggle = false,
    showFlatProofTabs = false,
    productPhotoSrc = "",
  },
  ref,
) {
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [subject, setSubject] = useState<GavelPreviewSubject>("gavel");
  // A stand's Plate tab already stacks the band proof above the plate proof,
  // so offering Band alongside it would be a second route to the same image.
  const bandTabVisible = showFlatProofTabs && !showStandToggle;
  const plateTabVisible = showFlatProofTabs && showStandToggle;
  const viewingProduct = subject === "product";
  const viewingBand = bandTabVisible && subject === "band";
  const viewingBlock = showSoundBlockToggle && subject === "soundBlock";
  // The plate reads as flat artwork, like the band: a 3D close-up of it only
  // ever showed the plaque foreshortened on the sloped face.
  const viewingPlate = plateTabVisible && subject === "plate";
  const viewingStandSet = showStandToggle && subject === "stand";
  const hideCanvas = viewingProduct || viewingBand || viewingPlate;
  const groundY = viewingBlock
    ? soundBlockGroundY()
    : viewingStandSet
      ? standGroundY()
      : gavelGroundY();
  const photoSrc = productPhotoSrc || style.thumbSrc;
  const cameraSubject: CameraSubject = viewingBlock
    ? "soundBlock"
    : viewingStandSet
      ? "stand"
      : "gavel";
  const cameraTarget = viewingBlock
    ? SOUND_BLOCK_VIEW_TARGET
    : viewingStandSet
      ? STAND_VIEW_TARGET
      : GAVEL_VIEW_TARGET;

  useEffect(() => {
    if (!showSoundBlockToggle && subject === "soundBlock") setSubject("gavel");
  }, [showSoundBlockToggle, subject]);

  useEffect(() => {
    if (showStandToggle) {
      setSubject((prev) =>
        prev === "gavel" || prev === "soundBlock" ? "stand" : prev,
      );
    } else {
      setSubject((prev) =>
        prev === "stand" || prev === "plate" ? "gavel" : prev,
      );
    }
  }, [showStandToggle]);

  // Resizing a phone-width window up to desktop retires the flat proof tabs;
  // without this the canvas would stay hidden behind a tab that is now gone.
  useEffect(() => {
    if (
      (subject === "band" && !bandTabVisible) ||
      (subject === "plate" && !plateTabVisible)
    ) {
      setSubject(showStandToggle ? "stand" : "gavel");
    }
  }, [subject, bandTabVisible, plateTabVisible, showStandToggle]);

  useImperativeHandle(ref, () => ({
    capturePngDataUrl() {
      const gl = glRef.current;
      if (!gl) return null;
      return gl.domElement.toDataURL("image/png");
    },
    async capturePngBlob() {
      const gl = glRef.current;
      if (!gl) return null;
      return await new Promise<Blob | null>((resolve) => {
        gl.domElement.toBlob((blob) => resolve(blob), "image/png");
      });
    },
  }));

  return (
    <div className={`gf-spin-preview ${className}`.trim()}>
      <div className="gf-preview-switch" role="tablist" aria-label="Preview">
        {showStandToggle ? (
          <button
            type="button"
            role="tab"
            aria-selected={subject === "stand"}
            className={subject === "stand" ? "is-on" : ""}
            onClick={() => setSubject("stand")}
          >
            Stand
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={subject === "gavel"}
          className={subject === "gavel" ? "is-on" : ""}
          onClick={() => setSubject("gavel")}
        >
          Gavel
        </button>
        {bandTabVisible ? (
          <button
            type="button"
            role="tab"
            aria-selected={subject === "band"}
            className={subject === "band" ? "is-on" : ""}
            onClick={() => setSubject("band")}
          >
            Band
          </button>
        ) : null}
        {showSoundBlockToggle ? (
          <button
            type="button"
            role="tab"
            aria-selected={subject === "soundBlock"}
            className={subject === "soundBlock" ? "is-on" : ""}
            onClick={() => setSubject("soundBlock")}
          >
            Sound block
          </button>
        ) : null}
        {plateTabVisible ? (
          <button
            type="button"
            role="tab"
            aria-selected={subject === "plate"}
            className={subject === "plate" ? "is-on" : ""}
            onClick={() => setSubject("plate")}
          >
            Plate
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={subject === "product"}
          className={subject === "product" ? "is-on" : ""}
          onClick={() => setSubject("product")}
        >
          <span className="gf-switch-long">Actual product</span>
          <span className="gf-switch-short">Product</span>
        </button>
      </div>
      {viewingProduct ? (
        <img
          src={photoSrc}
          alt={`Actual ${style.label} ${showStandToggle ? "gavel and stand" : "gavel"}`}
          className="gf-product-photo"
        />
      ) : null}
      {viewingBand ? (
        bandTextureUrl ? (
          <img
            src={bandTextureUrl}
            alt="Unwrapped gavel band with your custom text"
            className="gf-band-photo"
          />
        ) : (
          <div className="gf-band-photo-empty">
            Enter text to see it laid out on the band
          </div>
        )
      ) : null}
      {viewingPlate ? (
        <div className="gf-plate-proofs">
          <div className="gf-plate-proof">
            <span className="gf-plate-proof-label">
              Unwrapped band (custom proof)
            </span>
            {bandTextureUrl ? (
              <img
                src={bandTextureUrl}
                alt="Unwrapped gavel band with your custom text"
                className="gf-plate-proof-img"
              />
            ) : (
              <div className="gf-plate-proof-empty">
                Enter text to see it laid out on the band
              </div>
            )}
          </div>
          <div className="gf-plate-proof">
            <span className="gf-plate-proof-label">
              Stand plate (custom proof)
            </span>
            {plateProofUrl ? (
              <img
                src={plateProofUrl}
                alt="Stand plate with your custom text"
                className="gf-plate-proof-img is-shaped"
              />
            ) : (
              <div className="gf-plate-proof-empty">
                Enter band or plate text
              </div>
            )}
          </div>
        </div>
      ) : null}
      <Canvas
        shadows
        camera={{ position: [...GAVEL_VIEW_CAMERA_POSITION], fov: 28 }}
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
        style={{ visibility: hideCanvas ? "hidden" : "visible" }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1.06;
        }}
        onPointerDown={() => setHintVisible(false)}
      >
        <color attach="background" args={["#f7f4ef"]} />
        {/*
          Most of the light is ambient and hemispherical on purpose. Directional
          lights put a specular stripe down the band, which is a mirror of a
          light source rather than illumination: it blew out one edge of the
          engraving and left the rest of the ring in shadow. Carrying the
          brightness in non-directional light lifts the whole model instead.
        */}
        <ambientLight intensity={0.95} />
        <hemisphereLight args={["#fff4e4", "#b7aa96", 0.68]} />
        <directionalLight
          position={[5, 8, 6]}
          intensity={0.26}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-5, 3, -2]} intensity={0.16} />
        <directionalLight position={[2, 3.5, 12]} intensity={0.14} />
        <directionalLight position={[0, 1.2, 4]} intensity={0.1} />
        <CaptureBridge glRef={glRef} />
        <FrameView subject={cameraSubject} />
        {viewingBlock ? (
          <SoundBlockModel
            style={style}
            topTextureUrl={soundBlockTextureUrl || ""}
            shape={soundBlockShape}
          />
        ) : viewingStandSet ? (
          <>
            <StandModel
              key={`stand-v${STAND_GEOMETRY_REVISION}`}
              style={style}
              plateCanvas={plateCanvas}
              plateCanvasVersion={plateCanvasVersion}
              plateHex={plateHex}
            />
            <group
              position={[
                STAND_CONTACT.x,
                STAND_CONTACT.y + STAND_REST.liftIn,
                STAND_CONTACT.z,
              ]}
              rotation={[0, -Math.PI / 2, -STAND_REST.tiltRad, "ZYX"]}
            >
              <GavelModel
                style={style}
                bandTextureUrl={bandTextureUrl}
                bandHex={bandHex}
              />
            </group>
          </>
        ) : (
          <GavelModel
            style={style}
            bandTextureUrl={bandTextureUrl}
            bandHex={bandHex}
          />
        )}
        <ContactShadows
          position={[
            0,
            groundY - 0.02,
            viewingBlock ? 0 : viewingStandSet ? 0.35 : -4.35,
          ]}
          opacity={0.3}
          scale={viewingBlock ? 12 : viewingStandSet ? 20 : 26}
          blur={2.4}
          far={viewingBlock ? 8 : viewingStandSet ? 10 : 8.7}
        />
        <Environment
          preset="studio"
          environmentIntensity={GAVEL_ENV_INTENSITY}
        />
        <OrbitControls
          key={cameraSubject}
          target={[...cameraTarget]}
          enablePan={false}
          enableZoom
          minDistance={viewingStandSet ? 7 : viewingBlock ? 6 : 7.2}
          maxDistance={viewingBlock ? 28 : 32}
          minPolarAngle={
            viewingStandSet ? 0.32 : viewingBlock ? 0.14 : Math.PI / 2 - 0.42
          }
          maxPolarAngle={
            viewingStandSet
              ? Math.PI / 2 - 0.1
              : viewingBlock
                ? Math.PI / 2 - 0.18
                : Math.PI / 2 + 0.22
          }
          rotateSpeed={0.85}
        />
      </Canvas>
      {hintVisible && !hideCanvas ? (
        <div className="gf-spin-hint" aria-hidden>
          Drag to spin
        </div>
      ) : null}
    </div>
  );
});
