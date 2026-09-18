export type TrophyTypeId = "baseball" | "soccer" | "star" | "victory";

/** Engravable area, in percentages of the plate itself. */
export type TrophyTextArea = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/** A rectangle on the trophy photo, in percentages of that photo. */
export type TrophyBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type TrophyPlateOption = {
  id: string;
  label: string;
  trophySrc: string;
  plateSrc: string;
  textColor: string;
  textArea: TrophyTextArea;
  /**
   * Plate width divided by height. Omitted for the original four, whose plate
   * photography all shares `TROPHY_PLATE_RATIO`.
   */
  ratio?: number;
  /**
   * True when `plateSrc` is already cropped to the plate edges, so it fills
   * its box instead of being cropped by the shared offsets.
   */
  exact?: boolean;
};

export type TrophyProduct = {
  id: string;
  asin: string;
  label: string;
  shortLabel: string;
  category: "General Awards" | "School Awards" | "Sports Awards" | "Work Awards";
  description: string;
  defaultLines: [string, string, string];
  /** Photo shown on the award picker. */
  thumbnailSrc: string;
  /** Where the engraving plate sits on this product's trophy photo. */
  plateBounds: TrophyBounds;
  options: TrophyPlateOption[];
  /** Round 2" insert that takes an uploaded logo, on the listings that have one. */
  logoInsert?: TrophyBounds;
};

/**
 * Plain plates engrave inside the printed keyline. The themed plates carry
 * sport artwork across the top half, so their text sits in the clear band
 * underneath it and between the side graphics.
 */
export const PLAIN_PLATE_TEXT_AREA: TrophyTextArea = {
  top: 20,
  left: 15,
  width: 70,
  height: 60,
};

const BASEBALL_THEME_TEXT_AREA: TrophyTextArea = {
  top: 52,
  left: 19,
  width: 62,
  height: 37,
};

const SOCCER_THEME_TEXT_AREA: TrophyTextArea = {
  top: 47,
  left: 19,
  width: 62,
  height: 42,
};

/** Plate width divided by plate height, measured from the plate photography. */
export const TROPHY_PLATE_RATIO = 1.485;

export type TrophyType = {
  id: TrophyTypeId;
  label: string;
  description: string;
  plateBounds: TrophyBounds;
  options: TrophyPlateOption[];
};

const ROOT = "/images/trophy-tool";

const PLATE_ROOT = `${ROOT}/Insert Plates`;

/**
 * Plate designs for the 2" insert trophies. The source listings each shipped a
 * subset of these, but the artwork is pixel-identical wherever it repeats, so
 * one shared set covers every award.
 *
 * `textArea` is the clear space between the keyline and any printed ornament,
 * measured off each plate; the wide variants shift because widening leaves the
 * outer thirds at their original scale.
 */
const INSERT_PLATE_DESIGNS = [
  {
    id: "plain",
    label: "Brushed Gold",
    textColor: "#111111",
    textArea: { top: 10.2, left: 8, width: 83.8, height: 79.5 },
    wideTextArea: { top: 10.3, left: 7.1, width: 85.6, height: 79.4 },
  },
  {
    id: "brushed-silver",
    label: "Brushed Silver",
    textColor: "#111111",
    textArea: { top: 10.1, left: 7.3, width: 85.4, height: 79.7 },
    wideTextArea: { top: 10.1, left: 6.7, width: 86.6, height: 79.9 },
  },
  {
    id: "marble",
    label: "White Marble",
    textColor: "#111111",
    textArea: { top: 5, left: 4, width: 91.9, height: 89.9 },
    wideTextArea: { top: 5, left: 4, width: 91.9, height: 89.9 },
  },
  {
    id: "classic-black",
    label: "Classic Black",
    textColor: "#ffffff",
    textArea: { top: 11.6, left: 13.9, width: 72.1, height: 76.6 },
    wideTextArea: { top: 11.7, left: 12.1, width: 75.7, height: 76.5 },
  },
  {
    id: "corner-accents",
    label: "Corner Accents",
    textColor: "#111111",
    textArea: { top: 9.7, left: 12.2, width: 75.6, height: 80.3 },
    wideTextArea: { top: 9.9, left: 10.7, width: 78.6, height: 80.3 },
  },
  {
    id: "star-accents",
    label: "Star Accents",
    textColor: "#111111",
    textArea: { top: 18.6, left: 4, width: 91.9, height: 63.1 },
    wideTextArea: { top: 18.7, left: 4, width: 91.9, height: 63 },
  },
  {
    id: "academic",
    label: "Academic",
    textColor: "#111111",
    textArea: { top: 5, left: 41.7, width: 55.8, height: 89.9 },
    wideTextArea: { top: 5, left: 38.9, width: 58.5, height: 89.9 },
  },
];

/** The two insert-trophy bases take differently shaped plates. */
const STANDARD_PLATE_RATIO = 1.429;
const WIDE_PLATE_RATIO = 1.833;

/**
 * Finishes carried on every award rather than on one trophy. They are plain
 * materials, so unlike the themed and colored plates they suit any figure.
 */
const SHARED_FINISHES = [
  "brushed-silver",
  "marble",
  "classic-black",
] as const;

/**
 * Offers the shared finishes on one of the original four trophies, layered
 * over that trophy's own photography.
 *
 * `skip` drops finishes a trophy already sells as photographed plates: those
 * come with a matching trophy shot, so they are the better version of the
 * same design.
 */
function sharedFinishes(
  trophySrc: string,
  skip: readonly string[] = [],
): TrophyPlateOption[] {
  return SHARED_FINISHES.filter((id) => !skip.includes(id)).map((id) => {
    const design = INSERT_PLATE_DESIGNS.find((item) => item.id === id)!;
    return {
      id: design.id,
      label: design.label,
      trophySrc,
      plateSrc: `${PLATE_ROOT}/${design.id}.jpg`,
      textColor: design.textColor,
      textArea: design.textArea,
      ratio: TROPHY_PLATE_RATIO,
      exact: true,
    };
  });
}

export const TROPHY_TYPES: TrophyType[] = [
  {
    id: "baseball",
    label: "Baseball Trophy",
    description: "Gold baseball figure on a classic black base.",
    plateBounds: { left: 37.8, top: 62.6, width: 25.87, height: 17.73 },
    options: [
      {
        id: "baseball-theme",
        label: "Baseball Theme",
        trophySrc: `${ROOT}/Baseball Trophy/Male-Baseball-Figure-Trophy-Plate-Main-(baseball-theme).jpg`,
        plateSrc: `${ROOT}/Baseball Trophy/Male-Baseball-Figure-Trophy-Plate-Main-Preview-(baseball-theme).jpg`,
        textColor: "#111827",
        textArea: BASEBALL_THEME_TEXT_AREA,
      },
      {
        id: "brushed-gold",
        label: "Brushed Gold",
        trophySrc: `${ROOT}/Baseball Trophy/Male-Baseball-Figure-Trophy-Plate-Main-(brushed-gold).jpg`,
        plateSrc: `${ROOT}/Baseball Trophy/Male-Baseball-Figure-Trophy-Plate-Main-Preview-(brushed-gold).jpg`,
        textColor: "#111111",
        textArea: PLAIN_PLATE_TEXT_AREA,
      },
      {
        id: "champion-blue",
        label: "Champion Blue",
        trophySrc: `${ROOT}/Baseball Trophy/Male-Baseball-Figure-Trophy-Plate-Main-(champion-blue).jpg`,
        plateSrc: `${ROOT}/Baseball Trophy/Male-Baseball-Figure-Trophy-Plate-Main-Preview-(champion-blue).jpg`,
        textColor: "#ffffff",
        textArea: PLAIN_PLATE_TEXT_AREA,
      },
      {
        id: "victory-red",
        label: "Victory Red",
        trophySrc: `${ROOT}/Baseball Trophy/Male-Baseball-Figure-Trophy-Plate-Main-(victory-red).jpg`,
        plateSrc: `${ROOT}/Baseball Trophy/Male-Baseball-Figure-Trophy-Plate-Main-Preview-(victory-red).jpg`,
        textColor: "#ffffff",
        textArea: PLAIN_PLATE_TEXT_AREA,
      },
      ...sharedFinishes(
        `${ROOT}/Baseball Trophy/Male-Baseball-Figure-Trophy-Plate-Main-(brushed-gold).jpg`,
      ),
    ],
  },
  {
    id: "soccer",
    label: "Soccer Trophy",
    description: "Action soccer figure with a customizable plate.",
    plateBounds: { left: 39.07, top: 67.4, width: 22.2, height: 15.73 },
    options: [
      {
        id: "soccer-theme",
        label: "Soccer Theme",
        trophySrc: `${ROOT}/Soccer Trophy/Soccer-Action-Figure-Trophy-Plate-Main-(soccer-theme).jpg`,
        plateSrc: `${ROOT}/Soccer Trophy/Soccer-Action-Figure-Trophy-Plate-Main-Preview-(soccer-theme).jpg`,
        textColor: "#111827",
        textArea: SOCCER_THEME_TEXT_AREA,
      },
      {
        id: "brushed-gold",
        label: "Brushed Gold",
        trophySrc: `${ROOT}/Soccer Trophy/Soccer-Action-Figure-Trophy-Plate-Main-(brushed-gold).jpg`,
        plateSrc: `${ROOT}/Soccer Trophy/Soccer-Action-Figure-Trophy-Plate-Main-Preview-(brushed-gold).jpg`,
        textColor: "#111111",
        textArea: PLAIN_PLATE_TEXT_AREA,
      },
      {
        id: "champion-green",
        label: "Champion Green",
        trophySrc: `${ROOT}/Soccer Trophy/Soccer-Action-Figure-Trophy-Plate-Main-(champion-green).jpg`,
        plateSrc: `${ROOT}/Soccer Trophy/Soccer-Action-Figure-Trophy-Plate-Main-Preview-(champion-green).jpg`,
        textColor: "#ffffff",
        textArea: PLAIN_PLATE_TEXT_AREA,
      },
      {
        id: "victory-black",
        label: "Victory Black",
        trophySrc: `${ROOT}/Soccer Trophy/Soccer-Action-Figure-Trophy-Plate-Main-(victory-black).jpg`,
        plateSrc: `${ROOT}/Soccer Trophy/Soccer-Action-Figure-Trophy-Plate-Main-Preview-(victory-black).jpg`,
        textColor: "#ffffff",
        textArea: PLAIN_PLATE_TEXT_AREA,
      },
      // Victory Black already covers Classic Black.
      ...sharedFinishes(
        `${ROOT}/Soccer Trophy/Soccer-Action-Figure-Trophy-Plate-Main-(brushed-gold).jpg`,
        ["classic-black"],
      ),
    ],
  },
  {
    id: "star",
    label: "Star Trophy",
    description: "Modern gold star for all-purpose recognition.",
    plateBounds: { left: 37.27, top: 67.2, width: 24.8, height: 16 },
    options: [
      ["brushed-gold", "Brushed Gold", "#111111"],
      ["cobalt-blue", "Cobalt Blue", "#ffffff"],
      ["emerald-green", "Emerald Green", "#ffffff"],
      ["blush-pink", "Blush Pink", "#111111"],
    ].map(([id, label, textColor]) => ({
      id,
      label,
      trophySrc: `${ROOT}/Star Trophy/Star-Trophy-Plate-Main-(${id}) (1).jpg`,
      plateSrc: `${ROOT}/Star Trophy/Star-Trophy-Plate-Main-Preview-(${id}) (1).jpg`,
      textColor,
      textArea: PLAIN_PLATE_TEXT_AREA,
    })).concat(
      sharedFinishes(
        `${ROOT}/Star Trophy/Star-Trophy-Plate-Main-(brushed-gold) (1).jpg`,
      ),
    ),
  },
  {
    id: "victory",
    label: "Victory Figurine Trophy",
    description: "Winged victory figure with an elegant color plate.",
    plateBounds: { left: 39.67, top: 68, width: 23.13, height: 15.8 },
    options: [
      ["cobalt-blue", "Cobalt Blue"],
      ["emerald-green", "Emerald Green"],
      ["royal-purple", "Royal Purple"],
      ["ruby-red", "Ruby Red"],
    ].map(([id, label]) => ({
      id,
      label,
      trophySrc: `${ROOT}/Victory Figurine Trophy/Female-Victory-Figure-Trophy-Plate-Main-(${id}) (1).jpg`,
      plateSrc: `${ROOT}/Victory Figurine Trophy/Female-Victory-Figure-Trophy-Plate-Main-Preview-(${id}) (1).jpg`,
      textColor: "#f6d44b",
      textArea: PLAIN_PLATE_TEXT_AREA,
    })).concat(
      // This trophy only ships colored plates, so it takes the shared finishes.
      sharedFinishes(
        `${ROOT}/Victory Figurine Trophy/Female-Victory-Figure-Trophy-Plate-Main-(cobalt-blue) (1).jpg`,
      ),
    ),
  },
];

const INSERT_ROOT = `${ROOT}/Prestige Star Trophy`;



/**
 * Each award listing shares the same body but carries its own printed insert,
 * so every one needs its own photo.
 */
function insertTrophy(
  id: string,
  wide = false,
): Pick<TrophyProduct, "thumbnailSrc" | "options"> {
  const trophySrc = `${INSERT_ROOT}/${id}-trophy.jpg`;
  return {
    thumbnailSrc: trophySrc,
    options: INSERT_PLATE_DESIGNS.map((design) => ({
      id: design.id,
      label: design.label,
      trophySrc,
      plateSrc: `${PLATE_ROOT}/${design.id}${wide ? "-wide" : ""}.jpg`,
      textColor: design.textColor,
      textArea: wide ? design.wideTextArea : design.textArea,
      ratio: wide ? WIDE_PLATE_RATIO : STANDARD_PLATE_RATIO,
      exact: true,
    })),
  };
}

/** Plate footprints measured from each product's own photography. */
const GOLD_STAR_BOUNDS: TrophyBounds = {
  left: 36.6,
  top: 69.2,
  width: 26.6,
  height: 18.6,
};
const PRESTIGE_BOUNDS: TrophyBounds = {
  left: 40.8,
  top: 75.6,
  width: 21.6,
  height: 12.2,
};

/**
 * Customizable listings from the live trophy catalog, with the four original
 * trophies first. The separate blank, non-custom baseball listing is
 * intentionally omitted from the designer.
 */
export const TROPHY_PRODUCTS: TrophyProduct[] = [
  {
    id: "baseball",
    asin: "B0HHKRQ8B3",
    label: "All Quality Baseball Trophy, Custom Engraved 5” Batter Figure, Black Base",
    shortLabel: "Baseball Trophy",
    category: "Sports Awards",
    description: "A batter figure with custom engraving.",
    defaultLines: ["", "", ""],
    thumbnailSrc: getTrophyType("baseball").options[0].trophySrc,
    plateBounds: getTrophyType("baseball").plateBounds,
    options: getTrophyType("baseball").options,
  },
  {
    id: "soccer",
    asin: "B0HHQ1DY8S",
    label: "All Quality Soccer Trophy, Custom Engraved Ball & Cleat Figure, Black Base",
    shortLabel: "Soccer Trophy",
    category: "Sports Awards",
    description: "An action soccer figure with custom engraving.",
    defaultLines: ["", "", ""],
    thumbnailSrc: getTrophyType("soccer").options[0].trophySrc,
    plateBounds: getTrophyType("soccer").plateBounds,
    options: getTrophyType("soccer").options,
  },
  {
    id: "star",
    asin: "B0HJ5T58LF",
    label: "All Quality Star Trophy, Custom Engraved Star Shape, Black Base",
    shortLabel: "Custom Star Trophy",
    category: "General Awards",
    description: "An all-purpose star award with your custom engraving.",
    defaultLines: ["", "", ""],
    thumbnailSrc: getTrophyType("star").options[0].trophySrc,
    plateBounds: getTrophyType("star").plateBounds,
    options: getTrophyType("star").options,
  },
  {
    id: "victory",
    asin: "B0HHQD7KKR",
    label: "All Quality Victory Trophy, Custom Engraved Winged Figure, Black Base",
    shortLabel: "Victory Trophy",
    category: "General Awards",
    description: "A winged victory figure with your custom engraving.",
    defaultLines: ["", "", ""],
    thumbnailSrc: getTrophyType("victory").options[0].trophySrc,
    plateBounds: getTrophyType("victory").plateBounds,
    options: getTrophyType("victory").options,
  },
  {
    id: "custom-logo",
    asin: "B0HJHDSQSR",
    label: "All Quality Custom Logo Trophy, Blank Insert for Your Own Logo",
    shortLabel: "Custom Logo Trophy",
    category: "General Awards",
    description: "Drop your own logo into the round insert.",
    defaultLines: ["", "", ""],
    plateBounds: GOLD_STAR_BOUNDS,
    logoInsert: { left: 38.2, top: 13.3, width: 20.9, height: 20.3 },
    ...insertTrophy("custom-logo"),
  },
  {
    id: "perfect-attendance",
    asin: "B0HJH6WQ2T",
    label: "All Quality Perfect Attendance Trophy, Custom Engraved Star Award",
    shortLabel: "Perfect Attendance",
    category: "School Awards",
    description: "Recognize a full year of perfect attendance.",
    defaultLines: ["PERFECT ATTENDANCE", "", ""],
    plateBounds: { left: 38.3, top: 69.3, width: 23.2, height: 16.2 },
    ...insertTrophy("perfect-attendance"),
  },
  {
    id: "perfect-attendance-student",
    asin: "B0HJHWJ8CK",
    label: "All Quality Perfect Attendance Trophy (Student), Custom Engraved",
    shortLabel: "Perfect Attendance — Student",
    category: "School Awards",
    description: "A student-focused perfect attendance award.",
    defaultLines: ["PERFECT ATTENDANCE", "", ""],
    plateBounds: { left: 36.8, top: 68.9, width: 26.3, height: 18.4 },
    ...insertTrophy("perfect-attendance-student"),
  },
  {
    id: "team-player",
    asin: "B0HJH21K25",
    label: "All Quality Team Player Award Trophy, Custom Engraved Star Award",
    shortLabel: "Team Player Award",
    category: "School Awards",
    description: "Celebrate an outstanding team player.",
    defaultLines: ["TEAM PLAYER", "", ""],
    plateBounds: GOLD_STAR_BOUNDS,
    ...insertTrophy("team-player"),
  },
  {
    id: "student-of-the-month",
    asin: "B0HJ8WJ14Z",
    label: "All Quality Student of the Month Trophy, Custom Engraved Star Award",
    shortLabel: "Student of the Month",
    category: "School Awards",
    description: "A personalized student of the month award.",
    defaultLines: ["STUDENT OF THE MONTH", "", ""],
    plateBounds: GOLD_STAR_BOUNDS,
    ...insertTrophy("student-of-the-month"),
  },
  {
    id: "honor-roll",
    asin: "B0HJ937MRR",
    label: "All Quality Honor Roll Trophy, Custom Engraved Star Award, Black Base",
    shortLabel: "Honor Roll",
    category: "School Awards",
    description: "Recognize an honor roll achievement.",
    defaultLines: ["HONOR ROLL", "", ""],
    plateBounds: GOLD_STAR_BOUNDS,
    ...insertTrophy("honor-roll"),
  },
  {
    id: "star-employee",
    asin: "B0HJJM7JXD",
    label: "All Quality Star Employee Trophy, Custom Engraved",
    shortLabel: "Star Employee",
    category: "Work Awards",
    description: "Recognize a standout employee.",
    defaultLines: ["STAR EMPLOYEE", "", ""],
    plateBounds: PRESTIGE_BOUNDS,
    ...insertTrophy("star-employee", true),
  },
  {
    id: "top-sales",
    asin: "B0HJJHLBFM",
    label: "All Quality Top Sales Achievement Trophy, Custom Engraved",
    shortLabel: "Top Sales Achievement",
    category: "Work Awards",
    description: "Celebrate an exceptional sales achievement.",
    defaultLines: ["TOP SALES", "", ""],
    plateBounds: PRESTIGE_BOUNDS,
    ...insertTrophy("top-sales", true),
  },
  {
    id: "employee-of-the-month",
    asin: "B0HJHWPWM3",
    label: "All Quality Employee of the Month Trophy, Custom Engraved",
    shortLabel: "Employee of the Month",
    category: "Work Awards",
    description: "A personalized employee of the month award.",
    defaultLines: ["EMPLOYEE OF THE MONTH", "", ""],
    plateBounds: PRESTIGE_BOUNDS,
    ...insertTrophy("employee-of-the-month", true),
  },
];

export function getTrophyProduct(id: string): TrophyProduct {
  return TROPHY_PRODUCTS.find((product) => product.id === id) ?? TROPHY_PRODUCTS[0];
}

export const TROPHY_QUANTITY_PRICING = [
  24.99, 37.99, 45.99, 51.99, 54.99, 63.99, 71.99, 79.99, 87.99, 94.99,
  102.99, 110.99, 118.99, 125.99, 133.99, 140.99, 147.99, 155.99, 162.99,
  169.99,
] as const;

export const TROPHY_MAX_PRICED_QUANTITY = TROPHY_QUANTITY_PRICING.length;

export function getTrophyPrice(quantity: number): {
  total: number;
  perUnit: number;
} {
  const safeQuantity = Math.min(
    TROPHY_MAX_PRICED_QUANTITY,
    Math.max(1, Math.round(quantity)),
  );
  const total = TROPHY_QUANTITY_PRICING[safeQuantity - 1];
  const perUnit =
    Math.round((total / safeQuantity + Number.EPSILON) * 100) / 100;
  return { total, perUnit };
}

export function getTrophyType(id: TrophyTypeId): TrophyType {
  return TROPHY_TYPES.find((trophy) => trophy.id === id) ?? TROPHY_TYPES[0];
}
