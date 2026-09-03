import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

await page.goto(
  'https://gavelsfast.myshopify.com/products/10-1-2-american-walnut-gavel?preview_theme_id=142190772286',
  { waitUntil: 'domcontentloaded', timeout: 60000 }
);
await page.waitForTimeout(3000);

// Does our badge participate in the same selector halo.js uses to broadcast cart updates?
const binding = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('[data-cart-count]')];
  const ours = document.querySelector('.gfwm-cart-count');
  return {
    jQueryPresent: typeof window.$ === 'function',
    dataCartCountNodes: nodes.length,
    ourBadgeIncluded: nodes.includes(ours),
    classes: nodes.map((n) => n.className || '(no class)'),
  };
});
console.log('binding:', JSON.stringify(binding, null, 2));

// Simulate the exact broadcast halo.js performs on an AJAX cart update.
const broadcast = await page.evaluate(() => {
  window.$('[data-cart-count]').text(3);
  return document.querySelector('.gfwm-cart-count').textContent.trim();
});
console.log('badge after simulated cart update (expect "3"):', broadcast);

await browser.close();
