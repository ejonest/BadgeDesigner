import React from "react";

export type DeskSignPreviewTab = "design" | "product";

const TABS: Array<{ id: DeskSignPreviewTab; label: string }> = [
  { id: "design", label: "Design" },
  { id: "product", label: "Actual product" },
];

/**
 * Acrylic desk signs print white ink with no plate colour, so the design view
 * shows the text on a grey plate for legibility. This switches to a photo of the
 * finished product so the customer can see what they actually receive.
 */
export function AqbDeskSignPreviewTabs({
  activeTab,
  onChange,
}: {
  activeTab: DeskSignPreviewTab;
  onChange: (tab: DeskSignPreviewTab) => void;
}) {
  return (
    <div className="aqb-ds-preview-tabs" role="tablist" aria-label="Preview view">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`aqb-ds-preview-tab${
            activeTab === tab.id ? " is-active" : ""
          }`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function AqbDeskSignWhiteInkNotice({
  tab,
}: {
  tab: DeskSignPreviewTab;
}) {
  return (
    <p className="aqb-ds-ink-notice">
      {tab === "product" ? (
        <>
          Product photo for reference. Your text is printed in{" "}
          <strong>white ink</strong> directly on the acrylic.
        </>
      ) : (
        <>
          Your text prints in <strong>white ink</strong> on the acrylic. The grey
          plate shown here is only for contrast so you can check spacing and
          alignment — it is not printed.
        </>
      )}
    </p>
  );
}
