import {
  useEffect,
  useState,
  type ForwardRefExoticComponent,
  type Ref,
  type RefAttributes,
} from "react";
import type {
  GavelSpinPreviewHandle,
} from "~/components/GavelSpinPreview";
import type {
  GavelHandleLengthId,
  GavelStyleDef,
} from "~/constants/gavelStyles";

type PreviewProps = {
  style: GavelStyleDef;
  bandTextureUrl: string;
  bandHex?: string;
  handleLength?: GavelHandleLengthId;
  className?: string;
};

type PreviewComponent = ForwardRefExoticComponent<
  PreviewProps & RefAttributes<GavelSpinPreviewHandle>
>;

type Props = PreviewProps & {
  previewRef?: Ref<GavelSpinPreviewHandle>;
};

/**
 * Loads Three.js only in the browser so Remix SSR never evaluates WebGL.
 */
export function GavelSpinPreviewGate({ previewRef, ...props }: Props) {
  const [Preview, setPreview] = useState<PreviewComponent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("~/components/GavelSpinPreview")
      .then((mod) => {
        if (!cancelled) setPreview(() => mod.GavelSpinPreview);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="gf-spin-fallback">
        3D preview isn’t available in this browser. Use the unwrapped band below.
      </div>
    );
  }

  if (!Preview) {
    return <div className="gf-spin-fallback">Loading 3D preview…</div>;
  }

  return <Preview ref={previewRef} {...props} />;
}
