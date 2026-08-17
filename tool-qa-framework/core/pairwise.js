/**
 * Greedy pairwise (2-wise) test case generator.
 *
 * Given a set of parameters and their possible values, produces the
 * smallest practical list of test cases such that every PAIR of values
 * across every two different parameters appears together in at least
 * one test case. This is a standard combinatorial-testing technique:
 * instead of testing every full combination (which explodes
 * exponentially), pairwise testing catches the large majority of real
 * interaction bugs (e.g. "icon X is invisible on background Y") with a
 * dramatically smaller, practical number of test cases.
 *
 * This is a greedy approximation (not guaranteed minimal, but good
 * enough in practice and simple to audit).
 */

function generatePairwiseCases(dimensions) {
  const paramNames = Object.keys(dimensions);

  // Build the full set of (paramA=valA, paramB=valB) pairs that need covering.
  const allPairs = new Set();
  for (let i = 0; i < paramNames.length; i++) {
    for (let j = i + 1; j < paramNames.length; j++) {
      const pA = paramNames[i];
      const pB = paramNames[j];
      for (const vA of dimensions[pA]) {
        for (const vB of dimensions[pB]) {
          allPairs.add(pairKey(pA, vA, pB, vB));
        }
      }
    }
  }

  const uncovered = new Set(allPairs);
  const cases = [];

  // Track how many times each (param, value) has been used so far, so
  // ties in "how many new pairs does this cover" get broken toward the
  // least-used value instead of always defaulting to the first option.
  const usageCount = {};
  for (const param of paramNames) {
    usageCount[param] = {};
    for (const value of dimensions[param]) usageCount[param][value] = 0;
  }

  // Safety cap so a config mistake can't spin forever.
  const MAX_CASES = 500;

  while (uncovered.size > 0 && cases.length < MAX_CASES) {
    const testCase = {};

    // Order parameters so the ones with the most values go first —
    // gives the greedy choice more to work with early. Rotate the
    // starting point each case so the same parameter isn't always
    // "first pick" (which starves its value diversity).
    const rotation = cases.length % paramNames.length;
    const orderedParams = [...paramNames]
      .sort((a, b) => dimensions[b].length - dimensions[a].length);
    const rotated = [...orderedParams.slice(rotation), ...orderedParams.slice(0, rotation)];

    for (const param of rotated) {
      let bestValue = dimensions[param][0];
      let bestScore = -1;
      let bestUsage = Infinity;

      for (const candidateValue of dimensions[param]) {
        const score = countCoverableNewPairs(
          testCase,
          param,
          candidateValue,
          uncovered
        );
        const usage = usageCount[param][candidateValue];

        // Prefer higher score; break ties by preferring the least-used value.
        if (score > bestScore || (score === bestScore && usage < bestUsage)) {
          bestScore = score;
          bestUsage = usage;
          bestValue = candidateValue;
        }
      }

      testCase[param] = bestValue;
    }

    // Mark every pair formed by this finished test case as covered.
    for (let i = 0; i < paramNames.length; i++) {
      for (let j = i + 1; j < paramNames.length; j++) {
        const pA = paramNames[i];
        const pB = paramNames[j];
        uncovered.delete(
          pairKey(pA, testCase[pA], pB, testCase[pB])
        );
      }
    }

    for (const param of paramNames) {
      usageCount[param][testCase[param]] += 1;
    }

    cases.push(testCase);
  }

  return cases;
}

function countCoverableNewPairs(partialCase, param, value, uncovered) {
  let count = 0;
  for (const [otherParam, otherValue] of Object.entries(partialCase)) {
    const key = pairKey(param, value, otherParam, otherValue);
    if (uncovered.has(key)) count++;
  }
  return count;
}

function pairKey(paramA, valA, paramB, valB) {
  // Order-independent key so (A,B) and (B,A) collapse to the same pair.
  const first = paramA < paramB ? [paramA, valA, paramB, valB] : [paramB, valB, paramA, valA];
  return first.join('::');
}

module.exports = { generatePairwiseCases };
