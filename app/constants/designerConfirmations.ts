/** localStorage: skip reset-design confirmation modal (badge redesign). */
export const RESET_DESIGN_CONFIRM_DISMISSED_KEY =
  "badgeDesignerRedesignResetConfirmDismissed";

export function isResetDesignConfirmDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(RESET_DESIGN_CONFIRM_DISMISSED_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function dismissResetDesignConfirm(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RESET_DESIGN_CONFIRM_DISMISSED_KEY, "1");
  } catch {
    // ignore quota or other storage errors
  }
}
