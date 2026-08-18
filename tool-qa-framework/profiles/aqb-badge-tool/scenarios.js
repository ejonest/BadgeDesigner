/**
 * Named, hand-picked "real customer order" scenarios.
 *
 * The pairwise suite (test-cases.json) is deliberately generated for
 * broad coverage — it guarantees every PAIR of option-values gets
 * tested somewhere, but it does NOT guarantee that any specific full
 * combination (e.g. "blue + magnetic + 10-name bulk order + white
 * text") ever gets assembled into one single test case.
 *
 * This file is the fix for that: a short list of realistic, specific
 * orders — the kind an actual customer would place — tested exactly
 * as described, every run, regardless of what the pairwise generator
 * happens to produce. Add to this list whenever you think of (or hear
 * about) a real order pattern worth locking in.
 */

module.exports = [
  {
    id: 'scenario-blue-bulk10-gold-magnetic',
    description:
      '1x3 blue badge, 10 different names via the bulk CSV editor, gold text, magnetic backing',
    template: 'rounded-corners-1x3',
    badgeStyle: 'plain-color',
    backgroundColor: 'blue',
    icon: 'none',
    textColor: 'gold',
    font: 'montserrat',
    textLength: 'typical',
    backing: 'magnetic',
    orderType: 'multi-badge-csv',
    bulkQuantity: 10,
  },
  {
    id: 'scenario-church-usher-single',
    description:
      'Single badge, church usher role badge, cross icon, black background, gold text, pin backing',
    template: 'rounded-corners-1x3',
    badgeStyle: 'plain-color',
    backgroundColor: 'black',
    icon: 'cross',
    textColor: 'gold',
    font: 'raleway',
    textLength: 'typical',
    backing: 'pin',
    orderType: 'single-badge',
  },
  {
    id: 'scenario-hospital-bulk50-magnetic',
    description:
      'Large hospital rollout — 50 staff badges via bulk CSV, medical cross icon, white background, magnetic backing',
    template: 'rounded-corners-1.5x3',
    badgeStyle: 'plain-color',
    backgroundColor: 'white',
    icon: 'medical-cross',
    textColor: 'navy',
    font: 'source-sans-3',
    textLength: 'long-3-line',
    backing: 'magnetic',
    orderType: 'multi-badge-csv',
    bulkQuantity: 50,
  },
  {
    id: 'scenario-gold-single-name-only',
    description:
      'Single badge, brushed gold, name only (no title/company), no icon, adhesive backing — the simplest possible order',
    template: 'oval-1.5x3',
    badgeStyle: 'plain-color',
    backgroundColor: 'brushed-gold',
    icon: 'none',
    textColor: 'navy',
    font: 'montserrat',
    textLength: 'short',
    backing: 'adhesive',
    orderType: 'single-badge',
  },
  {
    id: 'scenario-restaurant-bulk-mixed',
    description:
      'Restaurant team order — 10 badges via bulk CSV, chef hat / fork-knife mixed roles, red background, gold text, pin backing',
    template: 'rounded-corners-1x3',
    badgeStyle: 'plain-color',
    backgroundColor: 'red',
    icon: 'chef-hat',
    textColor: 'gold',
    font: 'nunito',
    textLength: 'typical',
    backing: 'pin',
    orderType: 'multi-badge-csv',
    bulkQuantity: 10,
  },
];
