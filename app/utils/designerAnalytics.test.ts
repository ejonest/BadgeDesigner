import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  createDesignerAnalytics,
  DESIGNER_ANALYTICS_EVENTS,
  getDesignerAnalyticsSessionId,
} from "./designerAnalytics";

function installMemorySessionStorage() {
  const store = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
  vi.stubGlobal("sessionStorage", memory);
}

describe("designerAnalytics", () => {
  beforeEach(() => {
    installMemorySessionStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("reuses a session id per tool", () => {
    const a = getDesignerAnalyticsSessionId("badge");
    const b = getDesignerAnalyticsSessionId("badge");
    const c = getDesignerAnalyticsSessionId("gavel");
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it("dedupes opened, started, and step_completed", () => {
    const fetchMock = vi.mocked(fetch);
    const analytics = createDesignerAnalytics({
      tool: "badge",
      getEntry: () => "full-funnel",
    });
    analytics.opened();
    analytics.opened();
    analytics.started();
    analytics.started();
    analytics.stepCompleted("shape");
    analytics.stepCompleted("shape");
    analytics.stepCompleted("color");

    const bodies = fetchMock.mock.calls.map(
      (call) => JSON.parse(String(call[1]?.body)) as { event: string; step?: string },
    );
    const events = bodies.map((b) => b.event);
    expect(events.filter((e) => e === DESIGNER_ANALYTICS_EVENTS.opened)).toHaveLength(1);
    expect(events.filter((e) => e === DESIGNER_ANALYTICS_EVENTS.started)).toHaveLength(1);
    expect(
      events.filter((e) => e === DESIGNER_ANALYTICS_EVENTS.stepCompleted),
    ).toHaveLength(2);
    expect(bodies.some((b) => b.step === "color")).toBe(true);
  });

  it("records duration_ms from add-to-cart click to result", async () => {
    const fetchMock = vi.mocked(fetch);
    const analytics = createDesignerAnalytics({ tool: "sign" });
    analytics.addToCartClicked();
    await new Promise((r) => setTimeout(r, 20));
    analytics.addToCartResult(true);
    const confirmed = fetchMock.mock.calls
      .map((call) => JSON.parse(String(call[1]?.body)) as {
        event: string;
        duration_ms?: number;
        tool: string;
      })
      .find((b) => b.event === DESIGNER_ANALYTICS_EVENTS.addToCartConfirmed);
    expect(confirmed?.tool).toBe("sign");
    expect((confirmed?.duration_ms ?? 0) >= 15).toBe(true);
  });
});
