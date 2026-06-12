import { describe, expect, it } from "vitest";
import {
  areBadgePlateAndTextSameColor,
  badgeBackgroundConflictsWithTextColor,
  badgeTextColorConflictsWithBackground,
} from "./badgeColorContrast";

describe("badgeColorContrast", () => {
  it("treats plate black and text black as the same color", () => {
    expect(areBadgePlateAndTextSameColor("#2C2C2C", "#000000")).toBe(true);
    expect(areBadgePlateAndTextSameColor("#000000", "#2C2C2C")).toBe(true);
  });

  it("blocks background when any line uses the same color", () => {
    expect(
      badgeBackgroundConflictsWithTextColor("#2C2C2C", [
        { color: "#000000" },
      ]),
    ).toBe(true);
  });

  it("blocks text color that matches the background", () => {
    expect(
      badgeTextColorConflictsWithBackground("#000000", "#2C2C2C"),
    ).toBe(true);
    expect(
      badgeTextColorConflictsWithBackground("#FF0000", "#2C2C2C"),
    ).toBe(false);
  });
});
