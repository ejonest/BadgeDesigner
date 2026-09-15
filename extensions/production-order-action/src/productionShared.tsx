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
  iconUrl?: string;
  iconLabel?: string;
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

export function collapsedSummary(items: ProductionItem[]): string {
  const labels = items.map((item) => `${item.productLabel} × ${item.quantity}`);
  const texts = items.flatMap((item) =>
    itemGroups(item).flatMap((group) => group.lines.map((line) => line.text)),
  );
  const head = labels.slice(0, 3).join(" · ");
  if (texts.length === 0) return head;
  return `${head}: ${texts.slice(0, 3).join(" · ")}`;
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

function PreviewImage({
  src,
  alt,
  label,
}: {
  src: string;
  alt: string;
  label: string;
}) {
  return (
    <s-stack gap="small">
      <s-text type="strong">{label}</s-text>
      <s-image src={src} alt={alt} objectFit="contain" inlineSize="fill" />
    </s-stack>
  );
}

export function ProductionItemDetails({
  item,
  showPrintSvgs,
}: {
  item: ProductionItem;
  showPrintSvgs: boolean;
}) {
  const groups = itemGroups(item);
  return (
    <s-stack gap="base">
      {item.specs && item.specs.length > 0
        ? item.specs.map((spec) => (
            <s-text key={`${item.designId}-${spec.label}`}>
              {spec.label}: {spec.value}
            </s-text>
          ))
        : null}

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

      {item.thumbnailUrl ? (
        <PreviewImage
          src={item.thumbnailUrl}
          alt={`${item.productLabel} preview`}
          label="Preview"
        />
      ) : null}

      {item.iconUrl ? (
        <PreviewImage
          src={item.iconUrl}
          alt={item.iconLabel ?? `${item.productLabel} icon`}
          label={item.iconLabel ? `Icon · ${item.iconLabel}` : "Icon"}
        />
      ) : null}

      {item.uploadedImageUrl ? (
        <PreviewImage
          src={item.uploadedImageUrl}
          alt={`${item.productLabel} uploaded image`}
          label="Uploaded image"
        />
      ) : null}

      {showPrintSvgs && item.printSvgUrl ? (
        <PreviewImage
          src={item.printSvgUrl}
          alt={`${item.productLabel} print-ready SVG`}
          label="Print-ready SVG"
        />
      ) : null}

      {showPrintSvgs && item.secondarySvgUrl ? (
        <PreviewImage
          src={item.secondarySvgUrl}
          alt={`${item.productLabel} secondary print SVG`}
          label="Secondary print SVG"
        />
      ) : null}

      <ArtworkButtons item={item} />
    </s-stack>
  );
}
