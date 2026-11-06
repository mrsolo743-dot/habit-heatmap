// Сквозные тесты в настоящем браузере (Playwright + встроенный node:test).
// Запуск: npm run test:e2e  (нужен `npm install` и `npx playwright install chromium`)

import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from '../../scripts/serve.mjs';

const TODAY = '2026-11-06';
let server;
let browser;
let page;
let errors;
let base;

before(async () => {
  server = await startServer(0);
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

beforeEach(async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  page = await context.newPage();
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Приложение не использует alert/confirm/prompt — любой диалог считается ошибкой.
  page.on('dialog', (d) => { errors.push(`unexpected dialog: ${d.type()}`); d.dismiss(); });
  await page.goto(`${base}?today=${TODAY}`);
});

afterEach(async () => {
  await page.context().close();
  assert.deepEqual(errors, [], 'в консоли не должно быть ошибок');
});

async function addHabit(name) {
  await page.fill('#habit-name', name);
  await page.click('#add-form button[type=submit]');
}

test('пустое состояние и добавление привычки', async () => {
  assert.equal(await page.isVisible('#empty-hint'), true);
  await addHabit('Бег');
  assert.equal(await page.locator('.habit').count(), 1);
  assert.equal(await page.textContent('.habit .habit-name'), 'Бег');
  assert.equal(await page.isVisible('#empty-hint'), false);
});

test('дубликат названия показывает ошибку', async () => {
  await addHabit('Бег');
  await addHabit('бег');
  assert.equal(await page.isVisible('#form-error'), true);
  assert.match(await page.textContent('#form-error'), /уже есть/);
  assert.equal(await page.locator('.habit').count(), 1);
});

test('отметка за сегодня обновляет серию и карту', async () => {
  await addHabit('Бег');
  await page.click('.habit .check');
  assert.equal(await page.isChecked('.today-check'), true);
  assert.match(await page.textContent('.habit .streak'), /1/);
  const cell = page.locator(`.hm-cell[data-key="${TODAY}"]`);
  assert.equal(await cell.getAttribute('data-count'), '1');
});

test('клик по клетке карты меняет историю выбранной привычки', async () => {
  await addHabit('Бег');
  await page.click('.habit .habit-name'); // выбрать привычку
  assert.equal(await page.inputValue('#view-select') !== '__all__', true);
  await page.click('.hm-cell[data-key="2026-11-05"]');
  await page.click('.hm-cell[data-key="2026-11-04"]');
  const values = await page.locator('.stat-value').allTextContents();
  assert.equal(values[0], '2 дн.'); // текущая серия: 4 и 5 ноября, сегодня не отмечено
  assert.equal(values[3], '2');
  // будущие дни недоступны
  assert.equal(await page.locator('.hm-cell[data-key="2026-11-07"]').isDisabled(), true);
});

test('данные сохраняются после перезагрузки', async () => {
  await addHabit('Йога');
  await page.click('.habit .check');
  await page.reload();
  assert.equal(await page.textContent('.habit .habit-name'), 'Йога');
  assert.equal(await page.isChecked('.today-check'), true);
});

test('переименование, перестановка и удаление', async () => {
  await addHabit('A');
  await addHabit('B');
  await page.locator('.habit').nth(1).locator('.up').click();
  assert.deepEqual(await page.locator('.habit-name').allTextContents(), ['B', 'A']);
  await page.locator('.habit').nth(0).locator('.rename').click();
  await page.fill('.rename-input', 'Бег по утрам');
  await page.press('.rename-input', 'Enter');
  assert.deepEqual(await page.locator('.habit-name').allTextContents(), ['Бег по утрам', 'A']);
  // Esc отменяет переименование
  await page.locator('.habit').nth(1).locator('.rename').click();
  await page.fill('.rename-input', 'Что-то другое');
  await page.press('.rename-input', 'Escape');
  assert.deepEqual(await page.locator('.habit-name').allTextContents(), ['Бег по утрам', 'A']);
  await page.locator('.habit').nth(0).locator('.delete').click();
  assert.deepEqual(await page.locator('.habit-name').allTextContents(), ['A']);
});

test('удаление можно отменить из уведомления', async () => {
  await addHabit('Бег');
  await page.click('.habit .check');
  await page.locator('.habit .delete').click();
  assert.equal(await page.locator('.habit').count(), 0);
  await page.click('.toast-action');
  assert.equal(await page.locator('.habit').count(), 1);
  assert.equal(await page.isChecked('.today-check'), true);
});

test('горячие клавиши 1–9 отмечают привычки', async () => {
  await addHabit('A');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('1');
  assert.equal(await page.isChecked('.today-check'), true);
});

test('демо-данные, экспорт и импорт', async () => {
  await page.click('#demo-btn');
  assert.equal(await page.locator('.habit').count(), 3);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
  assert.equal(download.suggestedFilename(), `habits-${TODAY}.json`);
  const path = await download.path();

  await page.locator('.habit').nth(0).locator('.delete').click();
  assert.equal(await page.locator('.habit').count(), 2);

  await page.setInputFiles('#import-input', path);
  await page.waitForFunction(() => document.querySelectorAll('.habit').length === 3);
});

test('импорт битого файла показывает ошибку и не меняет данные', async () => {
  await addHabit('A');
  await page.setInputFiles('#import-input', {
    name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version": 7}'),
  });
  await page.waitForSelector('.toast.show.error');
  assert.match(await page.textContent('#toast'), /версия/);
  assert.equal(await page.locator('.habit').count(), 1);
});

test('переключение темы', async () => {
  const before = await page.getAttribute('html', 'data-theme');
  await page.click('#theme-btn');
  const afterTheme = await page.getAttribute('html', 'data-theme');
  assert.notEqual(before, afterTheme);
});

test('XSS: название выводится как текст', async () => {
  await addHabit('<img src=x onerror="window.pwned=1">');
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.equal(await page.locator('.habit img').count(), 0);
});

test('мобильная ширина: нет горизонтальной прокрутки страницы', async () => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.click('#demo-btn');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false);
});
