import { chromium } from 'playwright';

const BASE = 'https://gavelsfast.myshopify.com';
const PREVIEW = 'preview_theme_id=142190772286';

const pages = [
  ['home', '/'],
  ['collection', '/collections/all'],
  ['product', '/products/10-1-2-american-walnut-gavel'],
  ['search', '/search?q=gavel'],
  ['cart', '/cart'],
  ['page-404', '/pages/does-not-exist-xyz'],
];

const probe = () => {
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const visAll = (sel) => [...document.querySelectorAll(sel)].filter(vis).length;
  const search = document.querySelector('.gfwm-header__actions .gfwm-header__search');
  const cart = document.querySelector('.gfwm-header__actions a[href*="/cart"]');
  const brand = document.querySelector('.gfwm-brand');
  const main = document.querySelector('.gfwm-header__main');
  const brandLeftGap =
    brand && main
      ? Math.round(brand.getBoundingClientRect().left - main.getBoundingClientRect().left)
      : null;
  return {
    gfwmHeaders: visAll('.gfwm-header'),
    legacyHeaders: visAll('body > .wrapper-header'),
    gfwmFooters: visAll('.gfwm-footer'),
    legacyFooters: visAll('.site-footer'),
    brandLeftGap,
    searchLeftOfCart:
      !!(search && cart) &&
      search.getBoundingClientRect().right <= cart.getBoundingClientRect().left + 1,
    searchVisible: vis(search),
    stickyAtcPresent: !!document.querySelector('.footbar-fixed-product'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

console.log('--- desktop 1600px ---');
for (const [label, path] of pages) {
  const url = BASE + path + (path.includes('?') ? '&' : '?') + PREVIEW;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log(label.padEnd(11), JSON.stringify(await page.evaluate(probe)));
  await page.screenshot({ path: `/tmp/gf-header-${label}.png`, clip: { x: 0, y: 0, width: 1600, height: 400 } });
}

console.log('--- mobile 414px (collection) ---');
await page.setViewportSize({ width: 414, height: 900 });
await page.goto(BASE + '/collections/all?' + PREVIEW, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1500);
const mobile = await page.evaluate(() => {
  const vis = (s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
  };
  const brand = document.querySelector('.gfwm-brand').getBoundingClientRect();
  return {
    hamburger: vis('.gfwm-mobile-menu'),
    inlineSearch: vis('.gfwm-header__actions .gfwm-header__search'),
    dropdownSearch: vis('.gfwm-search'),
    brandCentreOffset: Math.round(brand.left + brand.width / 2 - window.innerWidth / 2),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
console.log('mobile     ', JSON.stringify(mobile));
await page.screenshot({ path: '/tmp/gf-header-mobile.png', clip: { x: 0, y: 0, width: 414, height: 340 } });

await browser.close();
