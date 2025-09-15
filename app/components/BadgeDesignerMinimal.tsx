import * as React from "react";
import BadgeSvgRenderer from "./BadgeSvgRenderer";
import { listTemplateOptions, loadTemplateById } from "~/utils/templates";
import type { Badge, BadgeLine } from "~/types/badge";

const DEFAULT_TEXT = (): BadgeLine[] => ([
  { id: "l1", text: "First line",  x: 168, y: 48, fontSize: 22, align: "center", bold: true },
  { id: "l2", text: "Second line", x: 168, y: 72, fontSize: 16, align: "center" },
]);

export default function BadgeDesigner() {
  const [templates] = React.useState(listTemplateOptions());
  const [templateId, setTemplateId] = React.useState(templates[0]?.id ?? "rect-1x3");
  const [badge, setBadge] = React.useState<Badge>({
    id: "preview",
    backgroundColor: "#FFFFFF",
    lines: DEFAULT_TEXT(),
    templateId
  });
  const [dims, setDims] = React.useState<{w:number; h:number}>({w:216, h:72});

  // keep template dims for sensible defaults
  React.useEffect(() => {
    (async () => {
      const t = await loadTemplateById(templateId);
      setDims({ w: t.widthPx, h: t.heightPx });
      // shift default text to mid of new template
      setBadge(b => ({
        ...b,
        templateId,
        lines: b.lines.map((ln, i) => ({
          ...ln,
          x: Math.round(t.widthPx / 2),
          y: i === 0 ? Math.round(t.heightPx * 0.45) : Math.round(t.heightPx * 0.70)
        }))
      }));
    })();
  }, [templateId]);

  // helpers
  const updateLine = (id: string, patch: Partial<BadgeLine>) =>
    setBadge(b => ({ ...b, lines: b.lines.map(l => l.id === id ? { ...l, ...patch } : l) }));

  const onBgUpload: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setBadge(b => ({
      ...b,
      backgroundImage: {
        src: String(r.result),
        widthPx: dims.w,
        heightPx: dims.h,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      }
    }));
    r.readAsDataURL(f);
  };

  const onLogoUpload: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setBadge(b => ({
      ...b,
      logo: { src: String(r.result), x: Math.round(dims.w*0.1), y: Math.round(dims.h*0.15), widthPx: 96, heightPx: 96, scale: 1 }
    }));
    r.readAsDataURL(f);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Controls */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Shape / Template</label>
          <select
            className="mt-1 w-full border rounded px-3 py-2"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">Current: {templateId} ({dims.w}×{dims.h}px)</p>
        </div>

        <div>
          <label className="block text-sm font-medium">Background color</label>
          <input type="color" className="mt-1" value={badge.backgroundColor}
                 onChange={(e)=>setBadge(b=>({...b, backgroundColor: e.target.value}))}/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Background image</label>
            <input type="file" accept="image/*" onChange={onBgUpload} className="mt-1" />
            {badge.backgroundImage && (
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <label>Scale
                  <input type="range" min={0.25} max={3} step={0.01}
                         value={badge.backgroundImage.scale ?? 1}
                         onChange={(e)=>setBadge(b=>({...b, backgroundImage:{...b.backgroundImage!, scale: Number(e.target.value)}}))}/>
                </label>
                <label>Offset X
                  <input type="range" min={-dims.w} max={dims.w} step={1}
                         value={badge.backgroundImage.offsetX ?? 0}
                         onChange={(e)=>setBadge(b=>({...b, backgroundImage:{...b.backgroundImage!, offsetX: Number(e.target.value)}}))}/>
                </label>
                <label>Offset Y
                  <input type="range" min={-dims.h} max={dims.h} step={1}
                         value={badge.backgroundImage.offsetY ?? 0}
                         onChange={(e)=>setBadge(b=>({...b, backgroundImage:{...b.backgroundImage!, offsetY: Number(e.target.value)}}))}/>
                </label>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">Logo</label>
            <input type="file" accept="image/*" onChange={onLogoUpload} className="mt-1" />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold">Text lines</h4>
          {badge.lines.map((ln)=>(
            <div key={ln.id} className="grid grid-cols-6 gap-2 items-center">
              <input className="col-span-3 border rounded px-2 py-1"
                     value={ln.text} onChange={(e)=>updateLine(ln.id, {text: e.target.value})}/>
              <input className="border rounded px-2 py-1 w-16"
                     type="number" value={ln.fontSize}
                     onChange={(e)=>updateLine(ln.id, {fontSize: Number(e.target.value)})}/>
              <select className="border rounded px-2 py-1"
                      value={ln.align || "center"}
                      onChange={(e)=>updateLine(ln.id, {align: e.target.value as any})}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
              <div className="flex gap-2">
                <label className="text-xs"><input type="checkbox" checked={!!ln.bold}
                  onChange={(e)=>updateLine(ln.id, {bold: e.target.checked})}/> Bold</label>
                <label className="text-xs"><input type="checkbox" checked={!!ln.italic}
                  onChange={(e)=>updateLine(ln.id, {italic: e.target.checked})}/> Italic</label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg border bg-white">
        <BadgeSvgRenderer badge={badge} templateId={templateId} />
      </div>
    </div>
  );
}
