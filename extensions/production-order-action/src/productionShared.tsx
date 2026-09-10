import { useEffect, useState } from "preact/hooks";

export type ProductionLine = {
  text: string;
  fontFamily: string;
  color?: string;
  alignment?: string;
  size?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type ProductionSpec = {
  label: string;
  value: string;
};

export type ProductionLineGroup = {
  heading: string;
  lines: ProductionLine[];
};

export type ProductionItem = {
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

export function lineDetails(line: ProductionLine): string {
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

export function itemGroups(item: ProductionItem): ProductionLineGroup[] {
  if (item.lineGroups && item.lineGroups.length > 0) return item.lineGroups;
  if (item.lines.length > 0) return [{ heading: "Text lines", lines: item.lines }];
  return [];
}

export function useProductionOrder(orderId: string | undefined) {
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
          throw new Error(body.error || `Request failed (${response.status}).`);
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

  return { items, error };
}

export function LineTable({
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

export function ArtworkButtons({ item }: { item: ProductionItem }) {
  return (
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
  );
}
