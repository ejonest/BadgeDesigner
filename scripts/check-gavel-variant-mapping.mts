/**
 * Checks that every gavel configuration resolves to the Shopify variant that
 * prices it. Reads the live storefront JSON, so it fails if the store options
 * are renamed out from under app/utils/gavelShopifyCatalog.ts.
 *
 * Run: npx vite-node scripts/check-gavel-variant-mapping.mts
 */
import {
  GAVEL_PRODUCT_HANDLES,
  SUEDE_BAG_PRODUCT_HANDLE,
  resolveGavelVariant,
  resolveSuedeBagVariant,
} from "../app/utils/gavelShopifyCatalog";
import {
  GAVEL_SOUND_BLOCK_IDS,
  GAVEL_SOUND_BLOCK_SHAPE_IDS,
  GAVEL_STYLE_IDS,
  isGavelRoundSoundBlockAvailable,
  isGavelSoundBlockOffered,
  isGavelStandOffered,
  type GavelProductType,
} from "../app/constants/gavelStyles";
import type { ShopifyProductJs } from "../app/utils/signShopifyCatalog";

const SHOP = process.env.GAVEL_SHOP_DOMAIN ?? "www.gavelsfast.com";

async function loadProduct(handle: string): Promise<ShopifyProductJs> {
  const res = await fetch(`https://${SHOP}/products/${handle}.js`);
  if (!res.ok) throw new Error(`${handle}: HTTP ${res.status}`);
  return (await res.json()) as ShopifyProductJs;
}

const failures: string[] = [];

for (const productType of ["gavel", "stand"] as GavelProductType[]) {
  const product = await loadProduct(GAVEL_PRODUCT_HANDLES[productType]);
  const soundBlocks =
    productType === "stand" ? (["none"] as const) : GAVEL_SOUND_BLOCK_IDS;

  for (const styleId of GAVEL_STYLE_IDS) {
    if (productType === "stand" && !isGavelStandOffered(styleId)) continue;

    for (const soundBlock of soundBlocks) {
      if (!isGavelSoundBlockOffered(soundBlock, styleId)) continue;

      for (const shape of GAVEL_SOUND_BLOCK_SHAPE_IDS) {
        if (shape === "round" && soundBlock === "none") continue;
        if (
          shape === "round" &&
          !isGavelRoundSoundBlockAvailable(soundBlock, styleId)
        ) {
          continue;
        }
        const match = resolveGavelVariant(product, {
          productType,
          styleId,
          soundBlock,
          soundBlockShape: shape,
        });
        const label = `${productType} / ${styleId} / ${soundBlock} / ${shape}`;
        if (!match) {
          failures.push(`${label}: no variant matched`);
          continue;
        }
        if (!(match.price > 0)) {
          failures.push(`${label}: price ${match.price}`);
          continue;
        }
        console.log(
          `ok  ${label.padEnd(44)} → ${match.variantId}  $${match.price.toFixed(2)}  ${match.title}`,
        );
      }
    }
  }
}

const bag = resolveSuedeBagVariant(await loadProduct(SUEDE_BAG_PRODUCT_HANDLE));
if (!bag || bag.price <= 0) {
  failures.push("suede bag: not resolved");
} else {
  console.log(`ok  suede bag${" ".repeat(24)} → ${bag.variantId}  $${bag.price.toFixed(2)}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("\nAll gavel configurations resolve to a priced variant.");
