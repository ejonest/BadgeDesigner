import { useEffect } from "react";

/** Tell the Shopify parent page to hide/show announcement + nav (badge designer iframe only). */
export function postDesignerChrome(collapsed: boolean) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(
    { action: "designer-chrome", collapsed: Boolean(collapsed) },
    "*",
  );
}

const SCROLL_DELTA_PX = 10;
const AT_TOP_PX = 6;

/**
 * On mobile embedded badge designer, collapse parent store chrome when the user
 * scrolls down in the editor panel; restore it when they scroll up or reach top.
 */
export function useEmbeddedMobileStoreChrome(
  enabled: boolean,
  scrollContainer: HTMLElement | null,
) {
  useEffect(() => {
    if (!enabled) {
      postDesignerChrome(false);
      return;
    }

    postDesignerChrome(false);

    const el = scrollContainer;
    if (!el) return;

    let lastScrollTop = el.scrollTop;
    let collapsed = false;

    const apply = (nextCollapsed: boolean) => {
      if (collapsed === nextCollapsed) return;
      collapsed = nextCollapsed;
      postDesignerChrome(nextCollapsed);
    };

    const onScroll = () => {
      const scrollTop = el.scrollTop;
      if (scrollTop <= AT_TOP_PX) {
        apply(false);
      } else if (scrollTop > lastScrollTop + SCROLL_DELTA_PX) {
        apply(true);
      } else if (scrollTop < lastScrollTop - SCROLL_DELTA_PX) {
        apply(false);
      }
      lastScrollTop = scrollTop;
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      postDesignerChrome(false);
    };
  }, [enabled, scrollContainer]);
}
