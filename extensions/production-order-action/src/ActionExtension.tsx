import "@shopify/ui-extensions/preact";
import { render } from "preact";
import {
  ArtworkButtons,
  itemGroups,
  LineTable,
  useProductionOrder,
} from "./productionShared";

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
          {items.map((item, itemIndex) => {
            const groups = itemGroups(item);
            return (
              <s-section
                key={`${item.designerId}-${item.designId}-${itemIndex}`}
                heading={`${item.productLabel} × ${item.quantity}`}
              >
                <s-stack gap="base">
                  {item.specs && item.specs.length > 0 ? (
                    <s-stack gap="small">
                      {item.specs.map((spec) => (
                        <s-text key={`${item.designId}-${spec.label}`}>
                          {spec.label}: {spec.value}
                        </s-text>
                      ))}
                    </s-stack>
                  ) : null}

                  {groups.length === 0 ? (
                    <s-text>No text lines were saved for this design.</s-text>
                  ) : (
                    groups.map((group) => (
                      <LineTable
                        key={`${item.designId}-${group.heading}`}
                        heading={group.heading}
                        lines={group.lines}
                      />
                    ))
                  )}

                  {item.printSvgUrl ? (
                    <s-stack gap="small">
                      <s-text type="strong">Print-ready SVG</s-text>
                      <s-image
                        src={item.printSvgUrl}
                        alt={`${item.productLabel} print-ready SVG`}
                        objectFit="contain"
                        inlineSize="fill"
                      />
                    </s-stack>
                  ) : null}

                  {item.secondarySvgUrl ? (
                    <s-stack gap="small">
                      <s-text type="strong">Secondary print SVG</s-text>
                      <s-image
                        src={item.secondarySvgUrl}
                        alt={`${item.productLabel} secondary print SVG`}
                        objectFit="contain"
                        inlineSize="fill"
                      />
                    </s-stack>
                  ) : null}

                  {item.thumbnailUrl ? (
                    <s-image
                      src={item.thumbnailUrl}
                      alt={`${item.productLabel} proof thumbnail`}
                      objectFit="contain"
                      inlineSize="fill"
                    />
                  ) : null}

                  <ArtworkButtons item={item} />
                </s-stack>
              </s-section>
            );
          })}
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
