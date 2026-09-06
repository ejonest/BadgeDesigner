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

type ProductionSpec = {
  label: string;
  value: string;
};

type ProductionLineGroup = {
  heading: string;
  lines: ProductionLine[];
};

type ProductionItem = {
  designerId: string;
  productLabel: string;
  designId: string;
  quantity: number;
  lines: ProductionLine[];
  lineGroups?: ProductionLineGroup[];
  specs?: ProductionSpec[];
  thumbnailUrl?: string;
  proofUrl?: string;
  uploadedImageUrl?: string;
  printSvgUrl?: string;
  secondarySvgUrl?: string;
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

function collapsedSummary(items: ProductionItem[]): string {
  const texts = items.flatMap((item) =>
    (item.lineGroups?.length
      ? item.lineGroups.flatMap((group) => group.lines)
      : item.lines
    ).map((line) => line.text),
  );
  if (texts.length === 0) return `${items.length} item${items.length === 1 ? "" : "s"}`;
  return texts.slice(0, 4).join(" · ");
}

function LineTable({
  heading,
  lines,
}: {
  heading: string;
  lines: ProductionLine[];
}) {
  return (
    <s-stack gap="small">
      <s-text type="strong">{heading}</s-text>
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Text</s-table-header>
          <s-table-header>Font</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {lines.map((line, lineIndex) => (
            <s-table-row key={`${heading}-${lineIndex}`}>
              <s-table-cell>
                Line {lineIndex + 1}: {line.text}
              </s-table-cell>
              <s-table-cell>{lineDetails(line)}</s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-stack>
  );
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

    const load = async () => {
      const token = await shopify.auth.idToken();
      if (!token) {
        throw new Error("Shopify did not issue an ID token for this session.");
      }
      return fetch(
        `/api/production/order?orderId=${encodeURIComponent(orderId)}`,
        {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    };

    load()
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
    <s-admin-block
      heading="Production design"
      collapsedSummary={items && items.length > 0 ? collapsedSummary(items) : undefined}
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
        <s-stack gap="large">
          {items.map((item, itemIndex) => {
            const groups =
              item.lineGroups && item.lineGroups.length > 0
                ? item.lineGroups
                : item.lines.length > 0
                  ? [{ heading: "Text lines", lines: item.lines }]
                  : [];

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

                  <s-stack direction="inline" gap="base">
                    {item.printSvgUrl ? (
                      <s-button href={item.printSvgUrl} target="_blank">
                        Open print SVG
                      </s-button>
                    ) : null}
                    {item.secondarySvgUrl ? (
                      <s-button href={item.secondarySvgUrl} target="_blank">
                        Open secondary SVG
                      </s-button>
                    ) : null}
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
