/**
 * Max manual/cart/ordered milestones per user+shop (autosave row is separate).
 * Must match prune logic in app/utils/supabase.ts (`pruneDesignMilestones`).
 */
export const DESIGN_LIBRARY_MILESTONE_LIMIT = 10;
