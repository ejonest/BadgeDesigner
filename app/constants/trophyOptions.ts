export type TrophyTypeId = "baseball" | "soccer" | "star" | "victory";

/** Engravable area, in percentages of the plate itself. */
export type TrophyTextArea = {
  top: number;
  left: number;
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
  plateBounds: { left: number; top: number; width: number; height: number };
  options: TrophyPlateOption[];
};

const ROOT = "/images/trophy-tool";

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
      ["rose-gold", "Rose Gold", "#111111"],
      ["blush-pink", "Blush Pink", "#111111"],
    ].map(([id, label, textColor]) => ({
      id,
      label,
      trophySrc: `${ROOT}/Star Trophy/Star-Trophy-Plate-Main-(${id}) (1).jpg`,
      plateSrc: `${ROOT}/Star Trophy/Star-Trophy-Plate-Main-Preview-(${id}) (1).jpg`,
      textColor,
      textArea: PLAIN_PLATE_TEXT_AREA,
    })),
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
    })),
  },
];

export function getTrophyType(id: TrophyTypeId): TrophyType {
  return TROPHY_TYPES.find((trophy) => trophy.id === id) ?? TROPHY_TYPES[0];
}
