import "@shopify/ui-extensions/preact";
import { render } from "preact";
import {
  ArtworkButtons,
  collapsedSummary,
  itemGroups,
  useProductionOrder,
} from "./productionShared";

const FULL_DETAILS_HREF = "extension:production-order-action";

function Extension() {
  const orderId = shopify.data.selected?.[0]?.id;
  const { items, error } = useProductionOrder(orderId);

  return (
    <s-admin-block
      heading="Production design"
      collapsedSummary={
        items && items.length > 0 ? collapsedSummary(items) : undefined
      }
    >
      {error ? (
        <s-banner tone="critical" heading="Production details unavailable">
          {error}
        </s-banner>
      ) : items === null ? (
        <s-stack direction="inline" gap="base">
          <s-spinner accessibilityLabel="Loading production details" />
          <s-text>Loading production details…</s-text>
        </s-stack>
      ) : items.length === 0 ? (
        <s-banner tone="info" heading="No linked design">
          No production design was found for this order. Older orders might need
          their store association backfilled.
        </s-banner>
      ) : (
        <s-stack gap="base">
          <s-button
            href={FULL_DETAILS_HREF}
            variant="primary"
            onClick={() => shopify.navigation.navigate(FULL_DETAILS_HREF)}
          >
            View full details
          </s-button>
          {items.map((item, itemIndex) => {
            const groups = itemGroups(item);
            return (
              <s-stack
                key={`${item.designerId}-${item.designId}-${itemIndex}`}
                gap="small"
              >
                <s-text type="strong">
                  {item.productLabel} × {item.quantity}
                </s-text>
                {item.specs?.map((spec) => (
                  <s-text key={`${item.designId}-${spec.label}`}>
                    {spec.label}: {spec.value}
                  </s-text>
                ))}
                {groups.length === 0 ? (
                  <s-text>No text lines were saved for this design.</s-text>
                ) : (
                  groups.map((group) => (
                    <s-text key={`${item.designId}-${group.heading}`}>
                      {group.heading}:{" "}
                      {group.lines.map((line) => line.text).join(" · ")}
                    </s-text>
                  ))
                )}
                {groups[0]?.lines[0] ? (
                  <s-text tone="neutral">
                    {groups[0].lines[0].fontFamily}
                    {groups[0].lines[0].size
                      ? ` · ${groups[0].lines[0].size}`
                      : ""}
                  </s-text>
                ) : null}
                <ArtworkButtons item={item} />
              </s-stack>
            );
          })}
        </s-stack>
      )}
    </s-admin-block>
  );
}

export default function extension() {
  render(<Extension />, document.body);
}
