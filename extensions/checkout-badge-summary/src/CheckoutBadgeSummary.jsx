/**
 * Checkout UI extension: show custom badge thumbnail + limited details in order summary.
 * Renders for line items that have _Custom Badge Design or _Custom Thumbnail (underscore-prefixed
 * properties are hidden by Shopify checkout but still available in line.attributes).
 */
import {
  reactExtension,
  useApi,
  BlockStack,
  InlineLayout,
  Image,
  Text,
  View,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension(
  "purchase.checkout.cart-line-item.render-after",
  () => <BadgeSummaryBlock />
);

function getAttr(attributes, key) {
  const a = (attributes || []).find((x) => x.key === key);
  return a ? a.value : "";
}

function BadgeSummaryBlock() {
  const api = useApi();
  const target = api.target;
  const line = target?.value ?? target?.current ?? null;
  if (!line || !line.attributes || line.attributes.length === 0) return null;

  const attrs = line.attributes;
  const isCustomBadge = getAttr(attrs, "_Custom Badge Design") === "Yes";
  const thumbnailUrl = getAttr(attrs, "_Custom Thumbnail") || getAttr(attrs, "Custom Thumbnail");
  if (!isCustomBadge && !thumbnailUrl) return null;

  const line1 = getAttr(attrs, "_Badge Text Line 1") || getAttr(attrs, "Badge Text Line 1");
  const line2 = getAttr(attrs, "_Badge Text Line 2") || getAttr(attrs, "Badge Text Line 2");
  const line3 = getAttr(attrs, "_Badge Text Line 3") || getAttr(attrs, "Badge Text Line 3");
  const line4 = getAttr(attrs, "_Badge Text Line 4") || getAttr(attrs, "Badge Text Line 4");
  const price = getAttr(attrs, "_Price") || getAttr(attrs, "Price");
  const backing = getAttr(attrs, "_Backing Type") || getAttr(attrs, "Backing Type");
  const bgColor = getAttr(attrs, "_Background Color") || getAttr(attrs, "Background Color");

  const hasDetails = line1 || line2 || line3 || line4 || price || backing || bgColor;
  if (!thumbnailUrl && !hasDetails) return null;

  const backingLabel = backing ? (backing.charAt(0).toUpperCase() + backing.slice(1)) : "";

  return (
    <View padding="base" background="subdued" cornerRadius="base">
      <InlineLayout spacing="base" blockAlignment="start" columns={["auto", "fill"]}>
        {thumbnailUrl ? (
          <Image
            source={thumbnailUrl}
            alt="Custom Badge Design"
            aspectRatio={1}
            loading="lazy"
          />
        ) : null}
        <BlockStack spacing="extraTight">
          {line1 ? <Text size="small">{line1}</Text> : null}
          {line2 ? <Text size="small">{line2}</Text> : null}
          {line3 ? <Text size="small">{line3}</Text> : null}
          {line4 ? <Text size="small">{line4}</Text> : null}
          {price ? (
            <Text size="small" emphasis="bold">
              Price: {price}
            </Text>
          ) : null}
          {backingLabel ? (
            <Text size="small">Attachment: {backingLabel}</Text>
          ) : null}
          {bgColor ? (
            <Text size="small">Background: {bgColor}</Text>
          ) : null}
        </BlockStack>
      </InlineLayout>
    </View>
  );
}
