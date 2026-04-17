/**
 * Max manual/cart/ordered milestones per user+shop (autosave row is separate).
 * Must match prune logic in app/utils/supabase.ts (`pruneDesignMilestones`).
 */
export const DESIGN_LIBRARY_MILESTONE_LIMIT = 10;

/** localStorage: user dismissed the "log in for cloud autosave" banner. */
export const CLOUD_LIBRARY_LOGIN_HINT_DISMISSED_KEY =
  "badgeDesignerCloudLibraryLoginHintDismissed";
