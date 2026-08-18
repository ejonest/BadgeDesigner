const fs = require('fs');
const path = require('path');
const dimensions = require('./dimensions');
const { generatePairwiseCases } = require('../../core/pairwise');

const cases = generatePairwiseCases(dimensions);

const withIds = cases.map((c, i) => ({
  id: `case-${String(i + 1).padStart(3, '0')}`,
  ...c,
}));

const outPath = path.join(__dirname, 'test-cases.json');
fs.writeFileSync(outPath, JSON.stringify(withIds, null, 2));

console.log(`[aqb-badge-tool] Generated ${withIds.length} pairwise test cases -> ${outPath}`);

const totalFullCombinations = Object.values(dimensions)
  .map((v) => v.length)
  .reduce((a, b) => a * b, 1);
console.log(`(Full cross-product would have been ${totalFullCombinations.toLocaleString()} combinations.)`);
