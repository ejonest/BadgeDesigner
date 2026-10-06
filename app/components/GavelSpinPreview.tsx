import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
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

/**
 * Which group of fields the shopper is editing. `token` bumps each time focus
 * enters a new group, so the preview follows the cursor once per move and the
 * shopper can still pick another tab while they type.
 */
export type GavelPreviewFocus = {
  area: "band" | "plate" | "soundBlock" | null;
  token: number;
};

/**
 * A framing: where to look, which way the camera sits, and the world-space box
 * the model occupies. The distance is solved from the canvas shape so the box
 * fills the frame with a small margin instead of floating in the middle.
 */
type PreviewFrame = {
  target: THREE.Vector3;
  /** Unit vector from the target out to the camera. */
  direction: THREE.Vector3;
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** Share of the frame the box should cover. The rest is the margin. */
  fill: number;
};

const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function viewDirection(
  camera: readonly [number, number, number],
  target: readonly [number, number, number],
) {
  return new THREE.Vector3(
    camera[0] - target[0],
    camera[1] - target[1],
    camera[2] - target[2],
  ).normalize();
}

/**
 * Side three-quarter of the whole gavel. The handle runs down −Z, so a view
 * from the end (the old camera) foreshortens it to a small head in the middle
 * of a wide canvas. From the side the handle spans the frame.
 */
const GAVEL_FRAME: PreviewFrame = {
  target: vec(0, 0, -3.7),
  direction: vec(1.05, 0.32, 0.62).normalize(),
  min: vec(-1.1, -1.55, -8.9),
  max: vec(1.1, 1.55, 1.1),
  fill: 0.9,
};

/**
 * The engraved face of the band, on the +Z side of the head. The head stands
 * 3" tall, so the box has to cover that or the close-up crops the beads.
 */
const BAND_FRAME: PreviewFrame = {
  target: vec(0, 0, 0),
  direction: vec(0.22, 0.16, 1).normalize(),
  min: vec(-1.15, -1.6, -0.3),
  max: vec(1.15, 1.6, 1.15),
  fill: 0.86,
};

const STAND_FRAME: PreviewFrame = {
  target: vec(...STAND_VIEW_TARGET),
  direction: viewDirection(STAND_VIEW_CAMERA_POSITION, STAND_VIEW_TARGET),
  min: vec(-6.1, -0.1, -2.6),
  max: vec(6.1, 4.0, 2.6),
  fill: 0.86,
};

const BLOCK_FRAME: PreviewFrame = {
  target: vec(...SOUND_BLOCK_VIEW_TARGET),
  direction: viewDirection(
    SOUND_BLOCK_VIEW_CAMERA_POSITION,
    SOUND_BLOCK_VIEW_TARGET,
  ),
  min: vec(-1.65, -0.65, -1.65),
  max: vec(1.65, 0.75, 1.65),
  fill: 0.88,
};

const _corner = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

/** Distance at which `frame`'s box fills `fill` of both the width and height. */
function fitDistance(camera: THREE.PerspectiveCamera, frame: PreviewFrame) {
  const worldUp =
    Math.abs(frame.direction.y) > 0.92
      ? _up.set(0, 0, 1)
      : _up.set(0, 1, 0);
  _right.crossVectors(worldUp, frame.direction).normalize();
  _up.crossVectors(frame.direction, _right).normalize();

  let halfW = 0.001;
  let halfH = 0.001;
  const { min, max, target } = frame;
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        _corner.set(x, y, z).sub(target);
        halfW = Math.max(halfW, Math.abs(_corner.dot(_right)));
        halfH = Math.max(halfH, Math.abs(_corner.dot(_up)));
      }
    }
  }

  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * Math.max(camera.aspect, 0.25);
  return Math.max(halfH / (tanV * frame.fill), halfW / (tanH * frame.fill));
}

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
  /**
   * Incremented when a covering modal closes. Remounts the WebGL canvas so a
   * context that went blank while the dialog was up comes back.
   */
  previewRevive?: number;
  /** Keeps the designer canvas centered when the shopper switches preview views. */
  onViewChange?: () => void;
  /** Field group being edited; the preview switches to the matching view. */
  focus?: GavelPreviewFocus;
  /** Reports the tab actually on screen, including switches the preview makes itself. */
  onSubjectChange?: (subject: GavelPreviewSubject) => void;
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

function FrameView({
  subject,
  bandZoom,
}: {
  subject: CameraSubject;
  bandZoom: boolean;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const controls = useThree((state) => state.controls) as {
    target: THREE.Vector3;
    minDistance: number;
    maxDistance: number;
    update: () => void;
  } | null;
  const applied = useRef<{ key: string; controls: unknown } | null>(null);

  useEffect(() => {
    const frame =
      subject === "soundBlock"
        ? BLOCK_FRAME
        : subject === "stand"
          ? STAND_FRAME
          : bandZoom
            ? BAND_FRAME
            : GAVEL_FRAME;
    const key = `${subject}|${bandZoom ? "band" : "wide"}|${Math.round(size.width)}x${Math.round(size.height)}`;
    if (
      !controls ||
      (applied.current?.key === key && applied.current.controls === controls)
    ) {
      return;
    }

    camera.aspect = size.width / Math.max(size.height, 1);
    const dist = fitDistance(camera, frame);
    camera.position.copy(frame.target).addScaledVector(frame.direction, dist);
    camera.lookAt(frame.target);
    camera.updateProjectionMatrix();
    controls.target.copy(frame.target);
    controls.minDistance = dist * 0.7;
    controls.maxDistance = dist * 1.4;
    controls.update();
    applied.current = { key, controls };
  }, [bandZoom, camera, controls, size.height, size.width, subject]);
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
    previewRevive = 0,
    onViewChange,
    focus,
    onSubjectChange,
  },
  ref,
) {
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [subject, setSubject] = useState<GavelPreviewSubject>("gavel");
  /** Cursor position the product photo magnifies around, in percent. */
  const [zoomOrigin, setZoomOrigin] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [enlarged, setEnlarged] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [bandZoom, setBandZoom] = useState(false);
  const lastFocusToken = useRef(0);
  const bandTabVisible = showFlatProofTabs;
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
  const photoAlt = `Actual ${style.label} ${showStandToggle ? "gavel and stand" : "gavel"}`;
  const chooseSubject = (next: GavelPreviewSubject) => {
    setSubject(next);
    onViewChange?.();
  };
  const cameraSubject: CameraSubject = viewingBlock
    ? "soundBlock"
    : viewingStandSet
      ? "stand"
      : "gavel";
  const shownSubject: GavelPreviewSubject = viewingProduct
    ? "product"
    : viewingBand
      ? "band"
      : viewingPlate
        ? "plate"
        : cameraSubject;
  useEffect(() => {
    onSubjectChange?.(shownSubject);
  }, [onSubjectChange, shownSubject]);
  const zoomOnBand = bandZoom && cameraSubject === "gavel";
  const viewFrame = viewingBlock
    ? BLOCK_FRAME
    : viewingStandSet
      ? STAND_FRAME
      : zoomOnBand
        ? BAND_FRAME
        : GAVEL_FRAME;

  const focusActive = Boolean(focus);
  const focusArea = focus?.area ?? null;
  const focusToken = focus?.token ?? 0;
  useEffect(() => {
    if (!focusActive || !focusArea) setBandZoom(false);
  }, [focusActive, focusArea]);
  useEffect(() => {
    if (focusToken === lastFocusToken.current) return;
    lastFocusToken.current = focusToken;
    if (!focusArea) return;
    setHintVisible(false);
    setBandZoom(focusArea === "band");
    if (focusArea === "band") {
      setSubject(bandTabVisible ? "band" : "gavel");
    } else if (focusArea === "plate") {
      if (plateTabVisible) setSubject("plate");
      else if (showStandToggle) setSubject("stand");
    } else if (focusArea === "soundBlock" && showSoundBlockToggle) {
      setSubject("soundBlock");
    }
  }, [
    focusToken,
    focusArea,
    bandTabVisible,
    plateTabVisible,
    showStandToggle,
    showSoundBlockToggle,
  ]);

  useEffect(() => {
    if (!showSoundBlockToggle && subject === "soundBlock") setSubject("gavel");
  }, [showSoundBlockToggle, subject]);

  // Leaving the tab (or swapping wood) should not strand a lens or a lightbox.
  useEffect(() => {
    if (!viewingProduct) {
      setZoomOrigin(null);
      setEnlarged(false);
    }
  }, [viewingProduct]);

  useEffect(() => {
    setEnlarged(false);
  }, [photoSrc]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (enlarged && !dialog.open) dialog.showModal();
    else if (!enlarged && dialog.open) dialog.close();
  }, [enlarged, viewingProduct]);

  const trackZoom = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    // Touch and pen taps go straight to the lightbox; only a mouse gets a lens.
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    setZoomOrigin({
      x: ((event.clientX - box.left) / box.width) * 100,
      y: ((event.clientY - box.top) / box.height) * 100,
    });
  }, []);

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
            onClick={() => chooseSubject("stand")}
          >
            Stand
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={subject === "gavel"}
          className={subject === "gavel" ? "is-on" : ""}
          onClick={() => chooseSubject("gavel")}
        >
          Gavel
        </button>
        {bandTabVisible ? (
          <button
            type="button"
            role="tab"
            aria-selected={subject === "band"}
            className={subject === "band" ? "is-on" : ""}
            onClick={() => chooseSubject("band")}
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
            onClick={() => chooseSubject("soundBlock")}
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
            onClick={() => chooseSubject("plate")}
          >
            Plate
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={subject === "product"}
          className={subject === "product" ? "is-on" : ""}
          onClick={() => chooseSubject("product")}
        >
          Real photo
        </button>
      </div>
      {viewingProduct ? (
        <>
          <button
            type="button"
            className={`gf-product-zoom${zoomOrigin ? " is-zoomed" : ""}`}
            onPointerMove={trackZoom}
            onPointerLeave={() => setZoomOrigin(null)}
            onClick={() => setEnlarged(true)}
            aria-label={`${photoAlt}. View larger`}
          >
            <img
              src={photoSrc}
              alt={photoAlt}
              className="gf-product-photo"
              style={
                zoomOrigin
                  ? { transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` }
                  : undefined
              }
            />
            <span className="gf-product-zoom-hint">
              <span className="gf-zoom-hint-hover">
                Hover to zoom · click to enlarge
              </span>
              <span className="gf-zoom-hint-tap">Tap to enlarge</span>
            </span>
          </button>
          {/*
            A modal <dialog> renders in the top layer, so it escapes the
            preview frame's clipped overflow without a portal, and it brings
            Escape-to-close and a focus trap with it.
          */}
          <dialog
            ref={dialogRef}
            className="gf-lightbox-dialog"
            aria-label={photoAlt}
            onClose={() => setEnlarged(false)}
          >
            <button
              type="button"
              className="gf-lightbox-dismiss"
              aria-label="Close larger view"
              onClick={() => setEnlarged(false)}
            />
            <div className="gf-lightbox">
              <img
                src={photoSrc}
                alt={photoAlt}
                className="gf-lightbox-img"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalHeight > 0) {
                    event.currentTarget.style.setProperty(
                      "--gf-lightbox-ar",
                      String(naturalWidth / naturalHeight),
                    );
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="gf-lightbox-close"
              onClick={() => setEnlarged(false)}
            >
              Close
            </button>
          </dialog>
        </>
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
              Stand plate (custom preview)
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
        key={previewRevive}
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
        <FrameView subject={cameraSubject} bandZoom={zoomOnBand} />
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
          key={`${cameraSubject}${zoomOnBand ? "-band" : ""}`}
          makeDefault
          target={viewFrame.target}
          enablePan={false}
          enableZoom
          minDistance={2}
          maxDistance={40}
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
      {hintVisible && !hideCanvas && !zoomOnBand ? (
        <div className="gf-spin-hint" aria-hidden>
          <span className="gf-spin-hint-desktop">
            Drag to spin · scroll to zoom
          </span>
          <span className="gf-spin-hint-mobile">
            Drag to spin · pinch to zoom
          </span>
        </div>
      ) : null}
    </div>
  );
});
