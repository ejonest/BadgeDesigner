import type { Badge } from "~/types/badge";
import { SIGN_BORDER_OPTION_NONE } from "~/data/signBorderTrims";

/**
 * Sync `signBorderStyleId` / `signBorderEnabled` from explicit option when present.
 * Does not infer `signBorderEnabled` from template id (that was legacy pre–border-step).
 */
export function migrateSignBorderFields(badge: Badge): Badge {
  const signBorderStyleId = badge.signBorderStyleId ?? "default";
  let signBorderEnabled = badge.signBorderEnabled;
  if (signBorderEnabled === undefined) {
    if (badge.signBorderOptionId === SIGN_BORDER_OPTION_NONE) {
      signBorderEnabled = false;
    } else if (
      badge.signBorderOptionId != null &&
      badge.signBorderOptionId !== SIGN_BORDER_OPTION_NONE
    ) {
      signBorderEnabled = true;
    }
  }
  return { ...badge, signBorderEnabled, signBorderStyleId };
}

/**
 * If the badge only has the older `signBorderEnabled` flag (no `signBorderOptionId` yet),
 * derive the option so the border step can stay complete after upgrade.
 */
export function backfillSignBorderOptionFromLegacyFields(
  badge: Badge,
): Badge {
  if (badge.signBorderOptionId !== undefined) return badge;
  if (badge.signBorderEnabled === undefined) return badge;
  return {
    ...badge,
    signBorderOptionId: badge.signBorderEnabled
      ? (badge.signBorderStyleId ?? "default")
      : SIGN_BORDER_OPTION_NONE,
  };
}

export function composeSignBorderMigrations(badge: Badge): Badge {
  return backfillSignBorderOptionFromLegacyFields(migrateSignBorderFields(badge));
}
