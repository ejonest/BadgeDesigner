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
import { GavelModel, gavelGroundY } from "~/components/gavel/GavelModel";
import type {
  GavelHandleLengthId,
  GavelStyleDef,
} from "~/constants/gavelStyles";
import { GAVEL_BAND_GOLD_HEX } from "~/constants/gavelStyles";

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
          camera={{ position: [2.8, 1.85, 8.4], fov: 28 }}
          dpr={[1, 2]}
          gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
          onCreated={({ gl }) => {
            gl.toneMappingExposure = 1.12;
          }}
          onPointerDown={() => setHintVisible(false)}
        >
          <color attach="background" args={["#f7f4ef"]} />
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[5, 8, 6]}
            intensity={1.15}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-5, 3, -2]} intensity={0.35} />
          <directionalLight position={[0, 1.2, 4]} intensity={0.22} />
          <CaptureBridge glRef={glRef} />
          <GavelModel
            style={style}
            bandTextureUrl={bandTextureUrl}
            bandHex={bandHex}
            handleLength={handleLength}
          />
          <ContactShadows
            position={[0, groundY - 0.02, -1.2]}
            opacity={0.32}
            scale={14}
            blur={2.4}
            far={6}
          />
          <Environment preset="studio" />
          <OrbitControls
            target={[0, 0.08, -2.0]}
            enablePan={false}
            enableZoom
            minDistance={4}
            maxDistance={16}
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
