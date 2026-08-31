/**
 * Rewires the Gavels Fast "Custom Gavel Tool V1" homepage.
 *
 * The Ella homepage is defined by `current.content_for_index` in
 * config/settings_data.json, so that array is the only existing value this
 * script touches. The previous homepage sections are left in
 * `current.sections` untouched — dropping them from `content_for_index` is
 * enough to take them off the page, and keeping them makes rollback trivial.
 *
 * Usage: node scripts/gf-build-homepage.mjs [themeDir]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const themeDir = process.argv[2] ?? "theme-gavel-tool-v1";
const settingsPath = join(themeDir, "config", "settings_data.json");

const raw = readFileSync(settingsPath, "utf8");
const jsonStart = raw.indexOf("{");
const header = raw.slice(0, jsonStart);
const data = JSON.parse(raw.slice(jsonStart));

const DESIGNER_PRODUCT = "custom-wooden-gavel";
const DESIGNER_URL = `/products/${DESIGNER_PRODUCT}`;
const CONTACT_URL = "/pages/contact-us";

const blocks = (type, list) => ({
  blocks: Object.fromEntries(
    list.map((settings, i) => [`${type}_${i + 1}`, { type, settings }]),
  ),
  block_order: list.map((_, i) => `${type}_${i + 1}`),
});

const newSections = {
  gf_hero: {
    type: "gf-home-hero",
    settings: {
      eyebrow: "Recognition done right",
      title: "Personalize your gavel, plaque or gift —",
      title_accent: "see it before you buy.",
      subtitle:
        "Trusted by law firms, bar associations and institutions for over 20 years. Customize it live, approve the preview on screen, and we create it in our own shop.",
      primary_label: "Start designing",
      primary_link: DESIGNER_URL,
      secondary_label: "Bulk & custom orders",
      secondary_link: CONTACT_URL,
      designer_product: DESIGNER_PRODUCT,
      // The hero shows a real screenshot of the designer (assets/
      // gf-designer-preview.webp, produced by scripts/gf-shot-designer.mjs)
      // rather than a mock built out of Liquid.
      shot_alt:
        "The Gavels Fast designer showing a live 3D preview of a walnut gavel with personalized text on its gold band",
    },
    ...blocks("perk", [
      { icon: "eye", title: "Live preview", text: "See it before you buy" },
      {
        icon: "pencil",
        title: "Easy to personalize",
        text: "Add text, logos and more",
      },
      { icon: "tag", title: "No minimum order", text: "Perfect for any size" },
      {
        icon: "truck",
        title: "Fast production",
        text: "Ships in 2–3 business days",
      },
    ]),
  },

  gf_trust: {
    type: "gf-home-trust-bar",
    settings: {},
    ...blocks("trust_item", [
      {
        icon: "pencil",
        title: "Easy to personalize",
        text: "Add names, titles and logos with our design tool.",
      },
      {
        icon: "tag",
        title: "No minimum order",
        text: "Order a single piece or a set for the whole slate.",
      },
      {
        icon: "truck",
        title: "Fast, reliable shipping",
        text: "Most personalized orders ship in 2–3 business days.",
      },
      {
        icon: "shield",
        title: "Quality guaranteed",
        text: "Solid hardwood and brass, customized in our own shop.",
      },
    ]),
  },

  gf_bestsellers: {
    type: "gf-home-bestsellers",
    settings: {
      eyebrow: "Customer favorites",
      title: "Our bestsellers",
      subtitle:
        "Our most popular gavels and sets — loved for quality and craftsmanship.",
      collection: "best-sellers-2024",
      products_to_show: 3,
      show_rank: true,
      show_vendor: false,
      card_link_label: "View details",
      view_all_label: "Shop all gavels",
      view_all_link: "/collections/gavels",
    },
  },

  gf_steps: {
    type: "gf-home-steps",
    settings: {
      eyebrow: "How it works",
      title: "Design your gavel in 4 simple steps",
      subtitle:
        "No artwork files, no proofs by email, no waiting. Customize it and preview the finished look on screen.",
      cta_label: "Start designing",
      cta_link: DESIGNER_URL,
    },
    ...blocks("step", [
      {
        icon: "gavel",
        title: "Choose your piece",
        text: "A gavel on its own, with a sound block, or paired with a stand.",
      },
      {
        icon: "layers",
        title: "Pick wood and finish",
        text: "Wooden walnut, hardwood or ebony, with a gold or silver band.",
      },
      {
        icon: "pencil",
        title: "Add your customization",
        text: "Type the names and titles, choose a font, and set each line.",
      },
      {
        icon: "eye",
        title: "Preview and order",
        text: "Turn it, zoom in, approve the proof on screen, then add to cart.",
      },
    ]),
  },

  gf_categories: {
    type: "gf-home-categories",
    settings: {
      eyebrow: "Shop by category",
      title: "Everything for the occasion",
      subtitle:
        "Gavels, presentation sets, plaques and desk signs — all customized in our own shop.",
    },
    ...blocks("category", [
      {
        collection: "gavels",
        image_product: "10-1-2-american-walnut-gavel",
        title: "Gavels",
        text: "Classic walnut, rosewood and ebony gavels for courts and chambers.",
        cta_label: "Shop gavels",
      },
      {
        collection: "gavel-sets",
        title: "Gavel Sets & Presentation Sets",
        text: "Boxed sets ready to present to an officer or an honoree.",
        cta_label: "Shop sets",
      },
      {
        collection: "sound-blocks",
        title: "Sound Blocks & Bands",
        text: "Square and round blocks, plus customizable solid brass bands.",
        cta_label: "Shop sound blocks",
      },
      {
        collection: "plaques",
        // The collection's own lead photo is 300x300 on a tan backdrop, which no
        // blend mode can reconcile with the cream frame. This one is 2000x2000
        // on pure white.
        image_product:
          "custom-logo-black-frame-wooden-award-plaque-easel-mount-option-upload-your-logo-recognition-of-achievement-and-service-personalizable-plaques",
        title: "Plaques",
        text: "Recognition, retirement and appreciation plaques.",
        cta_label: "Shop plaques",
      },
      {
        collection: "desk-stands",
        title: "Desk Signs & Nameplates",
        text: "Acrylic and rosewood desk signs with custom nameplates.",
        cta_label: "Shop desk signs",
      },
      {
        collection: "gift-items",
        title: "Mugs & Gift Items",
        text: "Finishing touches for the whole slate of officers.",
        cta_label: "Shop gifts",
      },
    ]),
  },

  gf_bulk: {
    type: "gf-home-bulk-social",
    settings: {
      // Off until volume pricing/terms are confirmed and a real review exists.
      // The copy stays here so both can be switched back on in the editor.
      show_bulk_card: false,
      show_quote: false,
      bulk_eyebrow: "Bulk & custom orders",
      bulk_title: "Outfitting a whole chapter, court or class?",
      bulk_text:
        "Tell us how many you need and how you want each item customized. We quote within one business day and handle the artwork for you.",
      bulk_points:
        "Volume pricing on 10 or more | Free customization setup — no artwork fees | Matching sets for officers and honorees | Purchase orders and net terms welcome",
      bulk_cta_label: "Request a bulk quote",
      bulk_cta_link: CONTACT_URL,
      quote:
        "The design tool showed me exactly what our customized gavel would look like, so there were no surprises. Our outgoing president was thrilled.",
      quote_name: "Karen D.",
      quote_role: "Bar association secretary",
      faq_title: "Common questions",
    },
    ...blocks("faq", [
      {
        question: "How long does customization take?",
        answer:
          "<p>Most personalized gavels and plaques ship in 2–3 business days. Rush options are available if you have a ceremony date to hit.</p>",
      },
      {
        question: "Can I preview my customized item before I order?",
        answer:
          "<p>Yes. The design tool shows your text on the actual piece, so you can approve the finished look before ordering.</p>",
      },
      {
        question: "Is there a minimum order?",
        answer:
          "<p>No. Order a single gavel, or a matching set for an entire chapter.</p>",
      },
      {
        question: "Do you charge artwork or setup fees?",
        answer:
          "<p>No. Customization setup is included, and there are no artwork fees for text or standard logos.</p>",
      },
      {
        question: "Can I add a logo or a seal?",
        answer:
          "<p>Yes. Add it in the design tool, or send it over and we will place it for you and share a proof.</p>",
      },
      {
        question: "Do you offer volume pricing?",
        answer:
          "<p>Yes. Pricing drops at 10 pieces or more. Request a quote and we will reply within one business day.</p>",
      },
    ]),
  },

  gf_close: {
    type: "gf-home-closing-cta",
    settings: {
      a_eyebrow: "Ready when you are",
      a_title: "Design your gavel in minutes.",
      a_text:
        "Pick your wood, add your text, and see the finished piece on screen before you spend a dollar.",
      a_cta_label: "Start designing",
      a_cta_link: DESIGNER_URL,
      b_eyebrow: "Need a hand?",
      b_title: "Talk to a customization specialist.",
      b_text:
        "Unusual wording, a logo, or a deadline to hit? Send us the details and we will tell you exactly what is possible.",
      b_cta_label: "Contact us",
      b_cta_link: CONTACT_URL,
    },
  },
};

const order = [
  "gf_hero",
  "gf_trust",
  "gf_bestsellers",
  "gf_steps",
  "gf_categories",
  "gf_bulk",
  "gf_close",
];

const collisions = order.filter((id) => id in data.current.sections);
if (collisions.length > 0) {
  console.warn(`Overwriting existing section entries: ${collisions.join(", ")}`);
}

Object.assign(data.current.sections, newSections);

const previous = data.current.content_for_index;
data.current.content_for_index = order;

writeFileSync(settingsPath, header + JSON.stringify(data, null, 2) + "\n");

console.log(`Updated ${settingsPath}`);
console.log(`  previous homepage order: ${previous.join(", ")}`);
console.log(`  new homepage order:      ${order.join(", ")}`);
console.log(
  `  retained ${previous.length} old section entries in current.sections for rollback`,
);
