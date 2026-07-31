import { runBleedJobs } from "./lib/mockup-bleed.mjs";

// Rebuild straight from the mockup so only the original asian dishes appear.
await runBleedJobs([
  {
    stem: "Restaurant-Specific-Badges-Asian-(1.5x3)",
    templateId: "rect-1_5x3",
    sourceName: "Restaurant-Specific-Badges-Asian-(1.5x3)-main-preview.jpg",
    crop: { left: 79, top: 416, width: 1341, height: 671 },
  },
  {
    stem: "Restaurant-Specific-Badges-Asian-(1x3)",
    templateId: "rect-1x3",
    sourceName: "Restaurant-Specific-Badges-Asian-(1x3)-main-preview.jpg",
    crop: { left: 86, top: 528, width: 1329, height: 443 },
  },
]);
