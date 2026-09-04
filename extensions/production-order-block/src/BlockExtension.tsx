import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

type ProductionLine = {
  text: string;
  fontFamily: string;
  color?: string;
  alignment?: string;
  size?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type ProductionItem = {
  designerId: string;
  productLabel: string;
  designId: string;
  quantity: number;
  lines: ProductionLine[];
  thumbnailUrl?: string;
  proofUrl?: string;
  uploadedImageUrl?: string;
};

type OrderResponse = {
  items?: ProductionItem[];
  error?: string;
};

function lineDetails(line: ProductionLine): string {
  return [
    line.fontFamily,
    line.size,
    line.color,
    line.alignment,
    line.bold ? "Bold" : null,
    line.italic ? "Italic" : null,
    line.underline ? "Underline" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Extension() {
  const orderId = shopify.data.selected?.[0]?.id;
  const [items, setItems] = useState<ProductionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Shopify did not provide an order ID.");
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);

    fetch(`/api/production/order?orderId=${encodeURIComponent(orderId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as OrderResponse;
        if (!response.ok) {
          throw new Error(
            body.error || `Request failed (${response.status}).`,
          );
        }
        setItems(body.items ?? []);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          if (timedOut) {
            setError("The request timed out before production details loaded.");
          }
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load production details.",
        );
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [orderId]);

  return (
    <s-admin-block heading="Production design">
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
        <s-stack gap="large">
          {items.map((item, itemIndex) => (
            <s-section
              key={`${item.designerId}-${item.designId}-${itemIndex}`}
              heading={`${item.productLabel} × ${item.quantity}`}
            >
              <s-stack gap="base">
                {item.lines.length === 0 ? (
                  <s-text>No text lines were saved for this design.</s-text>
                ) : (
                  item.lines.map((line, lineIndex) => (
                    <s-box
                      key={`${item.designId}-line-${lineIndex}`}
                      padding="small"
                    >
                      <s-stack gap="small">
                        <s-text>
                          Line {lineIndex + 1}: {line.text}
                        </s-text>
                        <s-text tone="neutral">{lineDetails(line)}</s-text>
                      </s-stack>
                    </s-box>
                  ))
                )}

                {item.thumbnailUrl ? (
                  <s-image
                    src={item.thumbnailUrl}
                    alt={`${item.productLabel} proof thumbnail`}
                  />
                ) : null}

                <s-stack direction="inline" gap="base">
                  {item.proofUrl ? (
                    <s-button href={item.proofUrl} target="_blank">
                      Open proof
                    </s-button>
                  ) : null}
                  {item.uploadedImageUrl ? (
                    <s-button
                      href={item.uploadedImageUrl}
                      target="_blank"
                      download="uploaded-image"
                    >
                      Download uploaded image
                    </s-button>
                  ) : null}
                </s-stack>
              </s-stack>
            </s-section>
          ))}
        </s-stack>
      )}
    </s-admin-block>
  );
}

export default function extension() {
  render(<Extension />, document.body);
}
