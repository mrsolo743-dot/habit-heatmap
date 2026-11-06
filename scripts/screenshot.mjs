// Делает скриншоты для README: `npm run screenshot` → docs/screenshot-light.png и docs/screenshot-dark.png

import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const server = await startServer(0);
const url = `http://127.0.0.1:${server.address().port}/?demo&today=2026-11-06`;
const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2 });
  await page.addInitScript((t) => localStorage.setItem('habit-heatmap:theme', t), theme);
  await page.goto(url);
  await page.check('.habit:nth-child(1) .today-check').catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `docs/screenshot-${theme}.png` });
  await page.close();
}

await browser.close();
server.close();
console.log('Скриншоты сохранены в docs/');
