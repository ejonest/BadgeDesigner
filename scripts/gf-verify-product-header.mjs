import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
});

await page.goto('https://gavelsfast.myshopify.com/collections/all?preview_theme_id=142190772286', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
const href = await page.evaluate(() => {
  const a = document.querySelector('.wrapper-container a[href*="/products/"]');
  return a ? a.getAttribute('href') : null;
});
const url = 'https://gavelsfast.myshopify.com' + href.split('?')[0] + '?preview_theme_id=142190772286';
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
  };
  return {
    url: location.pathname,
    gfwmHeaderVisible: vis(document.querySelector('.gfwm-header')),
    legacyVisible: vis(document.querySelector('body > .wrapper-header')),
    cartDrawerPresent: !!document.querySelector('.wrapper-top-cart, #cart-drawer, .mini-cart'),
    addToCartPresent: !!document.querySelector('[name="add"], .add-to-cart, .btn-addToCart'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
console.log(JSON.stringify(report, null, 2));
console.log('JS errors:', errors.length ? errors.slice(0, 8) : 'none');
await page.screenshot({ path: '/tmp/gf-header-product.png', clip: { x: 0, y: 0, width: 1600, height: 460 } });
await browser.close();
