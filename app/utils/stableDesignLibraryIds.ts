/** Client-safe: stable design_id for cloud autosave (one row per user + shop per table). */
export function stableAutosaveDesignId(userId: string, shopId: string): string {
  const seg = (s: string) =>
    s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
  return `autosave_${seg(userId)}_${seg(shopId)}`;
}
