// Делает скриншоты для README: `npm run screenshot` → docs/screenshot-light.png и docs/screenshot-dark.png
// Выбирается привычка «Зарядка», чтобы на скриншоте были видны цель на неделю и графики.

import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const server = await startServer(0);
const url = `http://127.0.0.1:${server.address().port}/?demo&today=2026-11-11`;
const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1060 }, deviceScaleFactor: 2 });
  await page.addInitScript((t) => localStorage.setItem('habit-heatmap:theme', t), theme);
  await page.goto(url);
  await page.click('.habit:nth-child(2) .habit-name');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `docs/screenshot-${theme}.png`, fullPage: true });
  await page.close();
}

await browser.close();
server.close();
console.log('Скриншоты сохранены в docs/');
