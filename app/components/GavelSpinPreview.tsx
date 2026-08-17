import {
  forwardRef,
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
import type {
  GavelHandleLengthId,
  GavelStyleDef,
} from "~/constants/gavelStyles";
import {
  GAVEL_BAND_GOLD_HEX,
  GAVEL_VIEW_CAMERA_POSITION,
  GAVEL_VIEW_TARGET,
  gavelGroundY,
} from "~/constants/gavelStyles";

/**
 * Reflection/IBL strength for the whole model. This has to live on the
 * Environment rather than per material: three.js replaces a material's
 * envMapIntensity with scene.environmentIntensity whenever the material has no
 * envMap of its own, which is the case for everything here.
 */
const GAVEL_ENV_INTENSITY = 0.5;

export type GavelSpinPreviewHandle = {
  capturePngDataUrl: () => string | null;
  capturePngBlob: () => Promise<Blob | null>;
};

type Props = {
  style: GavelStyleDef;
  bandTextureUrl: string;
  bandHex?: string;
  handleLength?: GavelHandleLengthId;
  className?: string;
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

export const GavelSpinPreview = forwardRef<GavelSpinPreviewHandle, Props>(
  function GavelSpinPreview(
    {
      style,
      bandTextureUrl,
      bandHex = GAVEL_BAND_GOLD_HEX,
      handleLength = "standard",
      className = "",
    },
    ref,
  ) {
    const glRef = useRef<THREE.WebGLRenderer | null>(null);
    const [hintVisible, setHintVisible] = useState(true);
    const groundY = gavelGroundY();

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
          {/*
            The studio Environment does nearly all the lighting (see
            GAVEL_ENV_INTENSITY), so these only shape the turned beads.
          */}
          <ambientLight intensity={0.12} />
          <directionalLight
            position={[5, 8, 6]}
            intensity={0.45}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-5, 3, -2]} intensity={0.16} />
          <directionalLight position={[0, 1.2, 4]} intensity={0.1} />
          <CaptureBridge glRef={glRef} />
          <GavelModel
            style={style}
            bandTextureUrl={bandTextureUrl}
            bandHex={bandHex}
            handleLength={handleLength}
          />
          <ContactShadows
            position={[0, groundY - 0.02, -4.35]}
            opacity={0.3}
            scale={26}
            blur={2.4}
            far={8.7}
          />
          <Environment
            preset="studio"
            environmentIntensity={GAVEL_ENV_INTENSITY}
          />
          <OrbitControls
            target={[...GAVEL_VIEW_TARGET]}
            enablePan={false}
            enableZoom
            minDistance={7.2}
            maxDistance={32}
            minPolarAngle={Math.PI / 2 - 0.42}
            maxPolarAngle={Math.PI / 2 + 0.22}
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
  },
);
