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
import type {
  GavelHandleLengthId,
  GavelStyleDef,
} from "~/constants/gavelStyles";
import {
  GAVEL_BAND_GOLD_HEX,
  GAVEL_VIEW_CAMERA_POSITION,
  GAVEL_VIEW_TARGET,
  SOUND_BLOCK_VIEW_CAMERA_POSITION,
  SOUND_BLOCK_VIEW_TARGET,
  gavelGroundY,
  soundBlockGroundY,
} from "~/constants/gavelStyles";

/**
 * Reflection/IBL strength for the whole model. This has to live on the
 * Environment rather than per material: three.js replaces a material's
 * envMapIntensity with scene.environmentIntensity whenever the material has no
 * envMap of its own, which is the case for everything here.
 */
const GAVEL_ENV_INTENSITY = 0.5;

export type GavelPreviewSubject = "gavel" | "soundBlock";

export type GavelSpinPreviewHandle = {
  capturePngDataUrl: () => string | null;
  capturePngBlob: () => Promise<Blob | null>;
};

export type GavelSpinPreviewProps = {
  style: GavelStyleDef;
  bandTextureUrl: string;
  bandHex?: string;
  handleLength?: GavelHandleLengthId;
  className?: string;
  /** Engraved sound-block plate art; toggle is shown when this is set. */
  soundBlockTextureUrl?: string;
  showSoundBlockToggle?: boolean;
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

function FrameView({ subject }: { subject: GavelPreviewSubject }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const pos =
      subject === "soundBlock"
        ? SOUND_BLOCK_VIEW_CAMERA_POSITION
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
    handleLength = "standard",
    className = "",
    soundBlockTextureUrl = "",
    showSoundBlockToggle = false,
  },
  ref,
) {
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [subject, setSubject] = useState<GavelPreviewSubject>("gavel");
  const viewingBlock = showSoundBlockToggle && subject === "soundBlock";
  const groundY = viewingBlock ? soundBlockGroundY() : gavelGroundY();

  useEffect(() => {
    if (!showSoundBlockToggle) setSubject("gavel");
  }, [showSoundBlockToggle]);

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
      {showSoundBlockToggle ? (
        <div className="gf-preview-switch" role="tablist" aria-label="Preview">
          <button
            type="button"
            role="tab"
            aria-selected={subject === "gavel"}
            className={subject === "gavel" ? "is-on" : ""}
            onClick={() => setSubject("gavel")}
          >
            Gavel
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subject === "soundBlock"}
            className={subject === "soundBlock" ? "is-on" : ""}
            onClick={() => setSubject("soundBlock")}
          >
            Sound block
          </button>
        </div>
      ) : null}
      <Canvas
        shadows
        camera={{ position: [...GAVEL_VIEW_CAMERA_POSITION], fov: 28 }}
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 0.95;
        }}
        onPointerDown={() => setHintVisible(false)}
      >
        <color attach="background" args={["#f7f4ef"]} />
        <ambientLight intensity={0.28} />
        <hemisphereLight args={["#fff4e4", "#b7aa96", 0.32]} />
        <directionalLight
          position={[5, 8, 6]}
          intensity={0.38}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-5, 3, -2]} intensity={0.22} />
        <directionalLight position={[2, 3.5, 12]} intensity={0.42} />
        <directionalLight position={[0, 1.2, 4]} intensity={0.16} />
        <CaptureBridge glRef={glRef} />
        <FrameView subject={viewingBlock ? "soundBlock" : "gavel"} />
        {viewingBlock ? (
          <SoundBlockModel
            style={style}
            plateTextureUrl={soundBlockTextureUrl || bandTextureUrl}
            plateHex={bandHex}
          />
        ) : (
          <GavelModel
            style={style}
            bandTextureUrl={bandTextureUrl}
            bandHex={bandHex}
            handleLength={handleLength}
          />
        )}
        <ContactShadows
          position={[0, groundY - 0.02, viewingBlock ? 0 : -4.35]}
          opacity={0.3}
          scale={viewingBlock ? 12 : 26}
          blur={2.4}
          far={viewingBlock ? 8 : 8.7}
        />
        <Environment
          preset="studio"
          environmentIntensity={GAVEL_ENV_INTENSITY}
        />
        <OrbitControls
          key={viewingBlock ? "soundBlock" : "gavel"}
          target={
            viewingBlock
              ? [...SOUND_BLOCK_VIEW_TARGET]
              : [...GAVEL_VIEW_TARGET]
          }
          enablePan={false}
          enableZoom
          minDistance={viewingBlock ? 8 : 7.2}
          maxDistance={viewingBlock ? 32 : 32}
          minPolarAngle={viewingBlock ? 0.55 : Math.PI / 2 - 0.42}
          maxPolarAngle={
            viewingBlock ? Math.PI / 2 - 0.12 : Math.PI / 2 + 0.22
          }
          rotateSpeed={0.85}
        />
      </Canvas>
      {hintVisible ? (
        <div className="gf-spin-hint" aria-hidden>
          Drag to spin
        </div>
      ) : null}
    </div>
  );
});
