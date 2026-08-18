/**
 * Sample data generators specific to how AQB's tool structures text
 * entry and its bulk CSV format. If a future profile uses a very
 * similar Name,Title CSV format, this pattern can be copied into that
 * profile's own sample-data.js — deliberately NOT promoted to core
 * until a second tool actually needs the same shape, per the "don't
 * abstract until there's a second real case" rule.
 */

const TEXT_SAMPLES = {
  short: { line1: 'Jo', line2: '', line3: '' },
  typical: { line1: 'Henry Manning', line2: 'Dentist', line3: '' },
  'long-3-line': { line1: 'Henry Manning', line2: 'Senior Greeter', line3: 'All Quality Badges' },
};

const SAMPLE_FIRST_NAMES = ['John', 'Jane', 'Alex', 'Sam', 'Priya', 'Wei', 'Maria', 'Tom', 'Nina', 'Omar',
  'Grace', 'Leo', 'Ava', 'Noah', 'Mia', 'Eli', 'Zoe', 'Kai', 'Ruth', 'Ivan',
  'Lena', 'Marco', 'Dana', 'Felix', 'Ines', 'Hugo', 'Amara', 'Jax', 'Tara', 'Rex',
  'Nora', 'Cole', 'Iris', 'Beau', 'Wren', 'Otis', 'Faye', 'Milo', 'Vera', 'Gus',
  'Lucia', 'Reid', 'Sasha', 'Drew', 'Elena', 'Finn', 'Talia', 'Jude', 'Cleo', 'Rocco'];
const SAMPLE_TITLES = ['Manager', 'Developer', 'Greeter', 'Nurse', 'Volunteer', 'Cashier', 'Host', 'Technician'];

function buildBulkCsv(count) {
  const rows = ['Name,Title'];
  for (let i = 0; i < count; i++) {
    const name = SAMPLE_FIRST_NAMES[i % SAMPLE_FIRST_NAMES.length] +
      (i >= SAMPLE_FIRST_NAMES.length ? ` ${Math.floor(i / SAMPLE_FIRST_NAMES.length) + 1}` : '');
    const title = SAMPLE_TITLES[i % SAMPLE_TITLES.length];
    rows.push(`${name},${title}`);
  }
  return rows.join('\n');
}

/**
 * Expands a test case's textLength/font/textColor into the flat fields
 * the declarative steps expect (textLine1, textLine2, textLine3).
 * Call this before passing a pairwise/scenario case into the flow
 * runner. Kept out of core since "textLength presets" is an
 * AQB-specific convenience, not a universal concept.
 */
function expandTextFields(caseData) {
  const sample = TEXT_SAMPLES[caseData.textLength || 'typical'];
  return {
    ...caseData,
    textLine1: sample.line1,
    textLine2: sample.line2,
    textLine3: sample.line3,
  };
}

module.exports = { TEXT_SAMPLES, buildBulkCsv, expandTextFields };
