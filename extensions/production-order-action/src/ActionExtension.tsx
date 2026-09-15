import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { ProductionItemDetails, useProductionOrder } from "./productionShared";

function Extension() {
  const orderId = shopify.data.selected?.[0]?.id;
  const { items, error } = useProductionOrder(orderId);
  const firstPrintSvg = items?.find((item) => item.printSvgUrl)?.printSvgUrl;

  return (
    <s-admin-action heading="Production design">
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
          No production design was found for this order.
        </s-banner>
      ) : (
        <s-stack gap="large">
          {items.map((item, itemIndex) => (
            <s-section
              key={`${item.designerId}-${item.designId}-${itemIndex}`}
              heading={`${item.productLabel} × ${item.quantity}`}
            >
              <ProductionItemDetails item={item} showPrintSvgs />
            </s-section>
          ))}
        </s-stack>
      )}

      {firstPrintSvg ? (
        <s-button
          slot="primary-action"
          variant="primary"
          href={firstPrintSvg}
          target="_blank"
        >
          Open print SVG
        </s-button>
      ) : null}
      <s-button slot="secondary-actions" onClick={() => shopify.close()}>
        Close
      </s-button>
    </s-admin-action>
  );
}

export default async function extension() {
  render(<Extension />, document.body);
}
