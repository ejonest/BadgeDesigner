export type MedalBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type MedalFieldShape = "circle" | "band";

export type MedalProduct = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  imageSrc: string;
  productHandle: string;
  textColor: string;
  /** Solid plate drawn over the printed placeholder. Omitted when wording sits on the artwork. */
  fieldColor: string;
  fieldShape: MedalFieldShape;
  /** Wording is drawn on the flag artwork instead of a solid plate. */
  textOnArtwork?: boolean;
  /** Product photo with the baked-in sample wording removed. */
  artworkSrc?: string;
  /** Percentages of the square product photo. */
  textArea: MedalBounds;
  /**
   * Variant on the single `custom-medal` product. Used when the page catalog
   * does not already include this center.
   */
  shopifyVariantId: string;
};

const CDN =
  "https://cdn.shopify.com/s/files/1/0275/0559/0372/files";

/** White center disc shared by the gold-star and USA-flag inserts. */
const WHITE_CIRCLE: Pick<MedalProduct, "textColor" | "fieldColor" | "fieldShape" | "textArea"> = {
  textColor: "#090d35",
  fieldColor: "#ffffff",
  fieldShape: "circle",
  textArea: { left: 41.4, top: 71.8, width: 18, height: 18 },
};

/** Navy center band on the sunburst inserts. */
const NAVY_BAND: Pick<MedalProduct, "textColor" | "fieldColor" | "fieldShape" | "textArea"> = {
  textColor: "#ffffff",
  fieldColor: "#000038",
  fieldShape: "band",
  textArea: { left: 36.6, top: 73.2, width: 27.2, height: 14.6 },
};

/** Centered wording drawn directly on the flag or stripe artwork. */
const CENTER_ART: Pick<MedalProduct, "textColor" | "fieldColor" | "fieldShape" | "textArea" | "textOnArtwork"> = {
  textColor: "#ffffff",
  fieldColor: "transparent",
  fieldShape: "band",
  textOnArtwork: true,
  textArea: { left: 41.9, top: 73.9, width: 16.6, height: 13 },
};

export const MEDAL_PRODUCTS: MedalProduct[] = [
  {
    id: "stars-and-stripes-stars",
    label: "Stars and Stripes Custom Personalized Stars Design Medal",
    shortLabel: "Stars and Stripes",
    description: "Blue star field with a waving flag behind the wording.",
    imageSrc: `${CDN}/d52419d2-1cb5-5e29-80d9-607919b5e9e1.jpg?v=1726074710`,
    productHandle:
      "stars-and-stripes-custom-personalized-stars-design-medal-choice-of-ribbon-usa-flag-personalized-award",
    ...CENTER_ART,
    artworkSrc: "/images/medal-tool/stars-and-stripes-stars.jpg",
    shopifyVariantId: "50877524082736",
  },
  {
    id: "stars-and-stripes-wreath",
    label: "Stars and Stripes Custom Personalized Wreath Design Medal",
    shortLabel: "Stars and Stripes Wreath",
    description: "Wreath medal with a blue star field and waving flag.",
    imageSrc: `${CDN}/d0f27543-7ae5-5aa2-9703-81c40d207994.jpg?v=1726074737`,
    productHandle:
      "stars-and-stripes-custom-personalized-wreath-design-medal-choice-of-ribbon-usa-flag-personalized-award",
    ...CENTER_ART,
    artworkSrc: "/images/medal-tool/stars-and-stripes-wreath.jpg",
    shopifyVariantId: "50877524115504",
  },
  {
    id: "usa-flag-stars",
    label: "USA Flag Custom Personalized Stars Design Medal",
    shortLabel: "USA Flag",
    description: "Flag insert with a white circle for the wording.",
    imageSrc: `${CDN}/0707b995-33fa-5fd9-a796-898aba853f07.jpg?v=1726074838`,
    productHandle:
      "usa-flag-custom-personalized-stars-design-medal-choice-of-ribbon-patriotic-personalized-award",
    ...WHITE_CIRCLE,
    shopifyVariantId: "50877524148272",
  },
  {
    id: "gold-stars",
    label: "Gold Star Custom Personalized Stars Design Medal",
    shortLabel: "Gold Star",
    description: "Stars insert with a white circle for the wording.",
    imageSrc: `${CDN}/724a420f-5838-5972-aedb-cedb5119b267.jpg?v=1726074762`,
    productHandle:
      "gold-star-custom-personalized-stars-design-medal-choice-of-ribbon-usa-flag-personalized-award",
    ...WHITE_CIRCLE,
    shopifyVariantId: "50877524181040",
  },
  {
    id: "gold-wreath",
    label: "Gold Star Custom Personalized Wreath Design Medal",
    shortLabel: "Gold Wreath",
    description: "Wreath insert with a white circle above the flag.",
    imageSrc: `${CDN}/c310c996-b269-5dea-859e-7f6310dabbe0.jpg?v=1726074891`,
    productHandle:
      "gold-star-custom-personalized-wreath-design-medal-choice-of-ribbon-usa-flag-personalized-award",
    ...WHITE_CIRCLE,
    shopifyVariantId: "50877524213808",
  },
  {
    id: "usa-flag-wreath",
    label: "USA Flag Custom Personalized Wreath Design Medal",
    shortLabel: "USA Flag Wreath",
    description: "Wreath medal with a flag and a white center circle.",
    imageSrc: `${CDN}/a006ecfa-d305-5976-95af-d7c0a1ef8a52.jpg?v=1726074788`,
    productHandle:
      "usa-flag-custom-personalized-wreath-design-medal-choice-of-ribbon-patriotic-personalized-award",
    ...WHITE_CIRCLE,
    shopifyVariantId: "50877524246576",
  },
  {
    id: "patriot-stars",
    label: "Patriot Custom Personalized Stars Design Medal",
    shortLabel: "Patriot Stars",
    description: "Stars insert with stripes across the center.",
    imageSrc: `${CDN}/0cddf1bb-5801-5aa0-b2a4-d03d9419277a.jpg?v=1726074941`,
    productHandle:
      "patriot-custom-personalized-stars-design-medal-choice-of-ribbon-usa-flag-personalized-award",
    ...CENTER_ART,
    artworkSrc: "/images/medal-tool/patriot-stars.jpg",
    shopifyVariantId: "50877524279344",
  },
  {
    id: "patriot-wreath",
    label: "Patriot Custom Personalized Wreath Design Medal",
    shortLabel: "Patriot Wreath",
    description: "Wreath medal with stripes across the center.",
    imageSrc: `${CDN}/5d995c1b-eee0-589d-9a20-f975ce6d2ad4.jpg?v=1726074916`,
    productHandle:
      "patriot-custom-personalized-wreath-design-medal-choice-of-ribbon-usa-flag-personalized-award",
    ...CENTER_ART,
    artworkSrc: "/images/medal-tool/patriot-wreath.jpg",
    shopifyVariantId: "50877524312112",
  },
  {
    id: "red-white-blue-stars",
    label: "Red White and Blue Custom Personalized Stars Design Medal",
    shortLabel: "Red White and Blue",
    description: "Sunburst insert with a navy band for the wording.",
    imageSrc: `${CDN}/a81de2ff-7c69-50b6-a33b-325f2981dfec.jpg?v=1726074813`,
    productHandle:
      "red-white-and-blue-custom-personalized-stars-design-medal-choice-of-ribbon-usa-flag-personalized-award",
    ...NAVY_BAND,
    shopifyVariantId: "50877524344880",
  },
  {
    id: "red-white-wreath",
    label: "Red White Custom Personalized Wreath Design Medal",
    shortLabel: "Red White Wreath",
    description: "Wreath medal with a sunburst and navy wording band.",
    imageSrc: `${CDN}/0e120d47-f291-50be-88af-dda0e185d51f.jpg?v=1726074865`,
    productHandle:
      "red-white-custom-personalized-wreath-design-medal-choice-of-ribbon-usa-flag-personalized-award",
    ...NAVY_BAND,
    shopifyVariantId: "50877524377648",
  },
];

/** One Shopify product; each center above is a variant on it. */
export const MEDAL_STYLE_PRODUCT_HANDLE = "custom-medal";

export type MedalShape = "stars" | "wreath";

export type MedalBackground = {
  id: string;
  label: string;
  description: string;
  starsId: string;
  wreathId: string;
};

/** Same five center artworks, each available as a stars medal or a wreath medal. */
export const MEDAL_BACKGROUNDS: MedalBackground[] = [
  {
    id: "gold",
    label: "Gold",
    description: "White circle for the wording, above the flag.",
    starsId: "gold-stars",
    wreathId: "gold-wreath",
  },
  {
    id: "stars-and-stripes",
    label: "Stars and Stripes",
    description: "Wording sits on the waving flag.",
    starsId: "stars-and-stripes-stars",
    wreathId: "stars-and-stripes-wreath",
  },
  {
    id: "usa-flag",
    label: "USA Flag",
    description: "Flag insert with a white circle for the wording.",
    starsId: "usa-flag-stars",
    wreathId: "usa-flag-wreath",
  },
  {
    id: "patriot",
    label: "Patriot",
    description: "Stripes across the center, behind the wording.",
    starsId: "patriot-stars",
    wreathId: "patriot-wreath",
  },
  {
    id: "red-white",
    label: "Red, White & Blue",
    description: "Sunburst with a navy band for the wording.",
    starsId: "red-white-blue-stars",
    wreathId: "red-white-wreath",
  },
];

export function medalBackgroundFor(productId: string): MedalBackground {
  return (
    MEDAL_BACKGROUNDS.find(
      (background) => background.starsId === productId || background.wreathId === productId,
    ) ?? MEDAL_BACKGROUNDS[0]
  );
}

export function medalShapeFor(productId: string): MedalShape {
  const background = medalBackgroundFor(productId);
  return background.wreathId === productId ? "wreath" : "stars";
}

export function medalIdForChoice(shape: MedalShape, backgroundId: string): string {
  const background =
    MEDAL_BACKGROUNDS.find((item) => item.id === backgroundId) ?? MEDAL_BACKGROUNDS[0];
  return shape === "wreath" ? background.wreathId : background.starsId;
}

export const MEDAL_MAX_QUANTITY = 100;

export function getMedalProduct(id: string): MedalProduct {
  return MEDAL_PRODUCTS.find((product) => product.id === id) ?? MEDAL_PRODUCTS[4];
}

/** Style option on the single Custom Medal product. */
export function medalIdForShopifyStyle(label: string): string | null {
  const target = label.trim().toLowerCase();
  if (!target || target === "default title") return null;
  return (
    MEDAL_PRODUCTS.find(
      (product) =>
        product.shortLabel.toLowerCase() === target ||
        product.label.toLowerCase() === target,
    )?.id ?? null
  );
}

export function getMedalPrice(quantity: number, fallbackPrice = 13.99) {
  const safeQuantity = Math.max(1, Math.min(MEDAL_MAX_QUANTITY, quantity));
  return {
    perUnit: fallbackPrice,
    total: fallbackPrice * safeQuantity,
  };
}
