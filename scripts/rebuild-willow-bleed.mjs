import { runBleedJobs } from "./lib/mockup-bleed.mjs";

// Crops cover the full outer badge, rather than the inset cream writing panel.
await runBleedJobs([
  {
    stem: "Nursing-Homes-Assisted-Living-Badges-Willow-(1.5x3)",
    templateId: "rect-1_5x3",
    sourceName:
      "Nursing-Homes-Assisted-Living-Badges-Willow-(1.5x3)-main-preview.jpg",
    crop: { left: 79, top: 416, width: 1341, height: 671 },
  },
  {
    stem: "Nursing-Homes-Assisted-Living-Badges-Willow-(1x3)",
    templateId: "rect-1x3",
    sourceName:
      "Nursing-Homes-Assisted-Living-Badges-Willow-(1x3)-main-preview.jpg",
    crop: { left: 86, top: 528, width: 1329, height: 443 },
  },
]);
