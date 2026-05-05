import type { Badge } from "~/types/badge";
import type { DesignerMotifId } from "~/data/designerMotifs";
import { composeSignBorderMigrations } from "./signBorderMigration";

/** Pre–multi-size plaque ids → default medium template for same layout family. */
const LEGACY_PLAQUE_TEMPLATE_MAP: Record<string, string> = {
  "plaque-detached": "plaque-detached-portrait-medium",
  "plaque-attached": "plaque-attached-medium",
};

/** Legacy sign template ids → base designer id + motif (pre–motif-library). */
const LEGACY_DESIGNER_TEMPLATE_MAP: Record<
  string,
  { templateId: string; designerMotif: DesignerMotifId }
> = (() => {
  const sizes = ["2x5", "2_8x7", "4x9", "4_25x11"] as const;
  const themes: { prefix: string; motif: DesignerMotifId }[] = [
    { prefix: "designer-coffee-bean-", motif: "coffee" },
    { prefix: "designer-golf-", motif: "golf" },
    { prefix: "designer-house-", motif: "house" },
    { prefix: "designer-money-", motif: "money" },
    { prefix: "designer-paws-", motif: "paws" },
    { prefix: "designer-recycle-", motif: "recycle" },
  ];
  const out: Record<
    string,
    { templateId: string; designerMotif: DesignerMotifId }
  > = {};
  for (const { prefix, motif } of themes) {
    for (const s of sizes) {
      out[`${prefix}${s}`] = { templateId: `designer-${s}`, designerMotif: motif };
    }
  }
  return out;
})();

/**
 * If `badge.templateId` is a removed themed Designer id, rewrite to base `designer-*` and set `designerMotif`.
 */
export function migrateLegacyDesignerTemplateId(badge: Badge): Badge {
  const tid = badge.templateId;
  if (!tid) return composeSignBorderMigrations(badge);
  const plaqueHit = LEGACY_PLAQUE_TEMPLATE_MAP[tid];
  if (plaqueHit) {
    return composeSignBorderMigrations({
      ...badge,
      templateId: plaqueHit,
    });
  }
  const hit = LEGACY_DESIGNER_TEMPLATE_MAP[tid];
  if (!hit) return composeSignBorderMigrations(badge);
  return composeSignBorderMigrations({
    ...badge,
    templateId: hit.templateId,
    designerMotif: badge.designerMotif ?? hit.designerMotif,
  });
}

export function migrateLegacyDesignerTemplateIdsOnBadges(
  badges: Badge[],
): Badge[] {
  return badges.map(migrateLegacyDesignerTemplateId);
}

const MIN_BADGE: Badge = {
  lines: [],
  backgroundColor: "#FFFFFF",
  backing: "pin",
};

/** Migrate a stored universal template id (cache / API) off removed themed Designer ids. */
export function migrateLegacyDesignerUniversalTemplateId(id: string): string {
  const plaque = LEGACY_PLAQUE_TEMPLATE_MAP[id];
  if (plaque) return plaque;
  const b = migrateLegacyDesignerTemplateId({ ...MIN_BADGE, templateId: id });
  return b.templateId || id;
}
