import { describe, expect, it } from "vitest";
import {
  buildBadgeTemplatePhotoThumbSvg,
  getBlankPhotoPlateConfig,
  resolveBlankBadgePhoto,
} from "./badgeBlankPhotos";

describe("badge template photo thumb pipeline", () => {
  it("resolves white photo for featured templates", () => {
    for (const id of ["rect-1x3", "rect-1_5x3", "oval-1_5x3", "house-1_5x3"]) {
      const plate = getBlankPhotoPlateConfig(id);
      expect(plate, id).toBeTruthy();
      const photo = resolveBlankBadgePhoto(id, "#FFFFFF");
      expect(photo, id).toBeTruthy();
      expect(photo!.src).toMatch(/^\/badge-blanks\//);
      expect(photo!.previewCropRect.width).toBeGreaterThan(0);
    }
  });

  it("builds expected white asset path for rect-1x3", () => {
    const photo = resolveBlankBadgePhoto("rect-1x3", "#FFFFFF");
    expect(photo?.src).toBe(
      "/badge-blanks/3x1-Rounded-Corners-Blank-Name-Tags-WEB-IMAGES/3x1-Rounded-Corners-Blank-Name-Tags-(white).jpg",
    );
  });

  it("generates thumb SVG referencing the photo URL", () => {
    const svg = buildBadgeTemplatePhotoThumbSvg("rect-1x3", "#FFFFFF");
    expect(svg).toBeTruthy();
    expect(svg!).toContain("<svg");
    expect(svg!).toContain(
      "/badge-blanks/3x1-Rounded-Corners-Blank-Name-Tags-WEB-IMAGES/3x1-Rounded-Corners-Blank-Name-Tags-(white).jpg",
    );
    expect(svg!).toContain("viewBox=");
  });
});
