/**
 * First-party + Shopify-parent step tracking for designer iframes.
 * Events hop: iframe postMessage → theme Shopify.analytics.publish → custom pixel → GA4.
 */

export const DESIGNER_ANALYTICS_EVENTS = {
  opened: "aqb:designer_opened",
  started: "aqb:customization_started",
  stepCompleted: "aqb:step_completed",
  previewGenerated: "aqb:preview_generated",
  previewError: "aqb:preview_error",
  addToCartClicked: "aqb:add_to_cart_clicked",
  addToCartConfirmed: "aqb:add_to_cart_confirmed",
  addToCartFailed: "aqb:add_to_cart_failed",
} as const;

export type DesignerAnalyticsEvent =
  (typeof DESIGNER_ANALYTICS_EVENTS)[keyof typeof DESIGNER_ANALYTICS_EVENTS];

export type DesignerAnalyticsTool =
  | "badge"
  | "desk-sign"
  | "sign"
  | "plaque"
  | "gavel";

export type DesignerAnalyticsPayload = {
  tool: DesignerAnalyticsTool;
  session_id: string;
  step?: string;
  entry?: string;
  duration_ms?: number;
  error_code?: string;
};

export type DesignerAnalytics = {
  opened: () => void;
  started: () => void;
  stepCompleted: (step: string) => void;
  previewGenerated: () => void;
  previewError: (error_code?: string) => void;
  addToCartClicked: () => void;
  addToCartResult: (success: boolean, error_code?: string) => void;
};

const SESSION_KEY_PREFIX = "aqb-analytics-session-";
const STARTED_KEY_PREFIX = "aqb-analytics-started-";
const OPENED_KEY_PREFIX = "aqb-analytics-opened-";
const STEPS_KEY_PREFIX = "aqb-analytics-steps-";

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

export function getDesignerAnalyticsSessionId(tool: DesignerAnalyticsTool): string {
  const key = `${SESSION_KEY_PREFIX}${tool}`;
  const existing = storageGet(key);
  if (existing) return existing;
  const id = randomId();
  storageSet(key, id);
  return id;
}

function readCompletedSteps(tool: DesignerAnalyticsTool): Set<string> {
  const raw = storageGet(`${STEPS_KEY_PREFIX}${tool}`);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((s): s is string => typeof s === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeCompletedSteps(tool: DesignerAnalyticsTool, steps: Set<string>): void {
  storageSet(`${STEPS_KEY_PREFIX}${tool}`, JSON.stringify([...steps]));
}

function postToParent(event: DesignerAnalyticsEvent, payload: DesignerAnalyticsPayload): void {
  if (typeof window === "undefined" || !window.parent || window.parent === window) {
    return;
  }
  try {
    window.parent.postMessage(
      { action: "designer-analytics", event, payload },
      "*",
    );
  } catch {
    /* ignore */
  }
}

function postFirstParty(event: DesignerAnalyticsEvent, payload: DesignerAnalyticsPayload): void {
  if (typeof fetch !== "function") return;
  const body = JSON.stringify({ event, ...payload });
  void fetch("/api/track-designer-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function emitDesignerAnalyticsEvent(
  event: DesignerAnalyticsEvent,
  payload: DesignerAnalyticsPayload,
): void {
  postToParent(event, payload);
  postFirstParty(event, payload);
}

export function createDesignerAnalytics(options: {
  tool: DesignerAnalyticsTool;
  getEntry?: () => string | undefined;
}): DesignerAnalytics {
  const { tool, getEntry } = options;
  let cartClickedAt: number | null = null;

  const base = (): DesignerAnalyticsPayload => ({
    tool,
    session_id: getDesignerAnalyticsSessionId(tool),
    ...(getEntry?.() ? { entry: getEntry() } : {}),
  });

  const emit = (
    event: DesignerAnalyticsEvent,
    extra?: Omit<DesignerAnalyticsPayload, "tool" | "session_id" | "entry">,
  ) => {
    emitDesignerAnalyticsEvent(event, { ...base(), ...extra });
  };

  return {
    opened() {
      const key = `${OPENED_KEY_PREFIX}${tool}`;
      if (storageGet(key) === "1") return;
      storageSet(key, "1");
      emit(DESIGNER_ANALYTICS_EVENTS.opened);
    },
    started() {
      const key = `${STARTED_KEY_PREFIX}${tool}`;
      if (storageGet(key) === "1") return;
      storageSet(key, "1");
      emit(DESIGNER_ANALYTICS_EVENTS.started);
    },
    stepCompleted(step: string) {
      const name = step.trim();
      if (!name) return;
      const done = readCompletedSteps(tool);
      if (done.has(name)) return;
      done.add(name);
      writeCompletedSteps(tool, done);
      this.started();
      emit(DESIGNER_ANALYTICS_EVENTS.stepCompleted, { step: name });
    },
    previewGenerated() {
      emit(DESIGNER_ANALYTICS_EVENTS.previewGenerated);
    },
    previewError(error_code?: string) {
      emit(DESIGNER_ANALYTICS_EVENTS.previewError, {
        ...(error_code ? { error_code: error_code.slice(0, 200) } : {}),
      });
    },
    addToCartClicked() {
      cartClickedAt = Date.now();
      emit(DESIGNER_ANALYTICS_EVENTS.addToCartClicked);
    },
    addToCartResult(success: boolean, error_code?: string) {
      const duration_ms =
        cartClickedAt != null ? Math.max(0, Date.now() - cartClickedAt) : undefined;
      emit(
        success
          ? DESIGNER_ANALYTICS_EVENTS.addToCartConfirmed
          : DESIGNER_ANALYTICS_EVENTS.addToCartFailed,
        {
          ...(duration_ms != null ? { duration_ms } : {}),
          ...(error_code ? { error_code: error_code.slice(0, 200) } : {}),
        },
      );
    },
  };
}
