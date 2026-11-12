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

async function addHabit(name, goal = null) {
  await page.fill('#habit-name', name);
  if (goal) await page.selectOption('#habit-goal', String(goal));
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
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(await overflow(), false);
  // календарный год шире экрана телефона — прокручивается сама карта, а не страница
  await page.click('.habit .habit-name');
  await page.selectOption('#year-select', '2026');
  assert.equal(await overflow(), false);
  const scrolled = await page.$eval('#heatmap', (el) => el.scrollLeft > 0);
  assert.equal(scrolled, true, 'для текущего года карта прокручена к свежим неделям');
});

// ---------- Цели на неделю ----------

test('цель задаётся при добавлении и видна в списке', async () => {
  await addHabit('Спортзал', 3);
  assert.equal(await page.textContent('.habit .goal-pill'), '0/3');
  await page.click('.habit .check');
  assert.equal(await page.textContent('.habit .goal-pill'), '1/3');
  assert.equal(await page.locator('.habit .goal-pill.met').count(), 0);
  // после добавления форма возвращается к цели по умолчанию — «каждый день»
  assert.equal(await page.inputValue('#habit-goal'), '7');
  await addHabit('Вода');
  assert.equal(await page.locator('.habit .goal-pill').nth(1).textContent(), '0/7');
});

test('панель цели: прогресс недели, смена цели и сохранение', async () => {
  await addHabit('Спортзал', 2);
  assert.equal(await page.isVisible('#goal-panel'), false, 'в режиме «все привычки» панели нет');
  await page.click('.habit .habit-name');
  assert.equal(await page.isVisible('#goal-panel'), true);
  assert.equal(await page.inputValue('#goal-select'), '2');
  assert.equal(await page.locator('.goal-dot').count(), 2);
  // 6 ноября — пятница: отмечаем среду и четверг, цель 2 выполнена
  await page.click('.hm-cell[data-key="2026-11-04"]');
  await page.click('.hm-cell[data-key="2026-11-05"]');
  assert.equal(await page.locator('.goal-dot.done').count(), 2);
  assert.match(await page.textContent('.goal-text'), /выполнена/);
  assert.equal(await page.locator('.habit .goal-pill.met').count(), 1);
  const goalStats = await page.locator('#goal-stats .stat-value').allTextContents();
  assert.equal(goalStats[0], '1 нед.');

  await page.selectOption('#goal-select', '5');
  assert.equal(await page.textContent('.habit .goal-pill'), '2/5');
  // пт, сб, вс — 3 дня, нужно ещё 3 раза: успеть можно
  assert.match(await page.textContent('.goal-text'), /Осталось 3 раза за 3 дня/);
  await page.reload();
  assert.equal(await page.inputValue('#goal-select'), '5');
  assert.equal(await page.textContent('.habit .goal-pill'), '2/5');
});

test('предупреждение, если цель недели уже не успеть', async () => {
  await page.goto(`${base}?today=2026-11-08`); // воскресенье
  await addHabit('Бассейн', 3);
  await page.click('.habit .habit-name');
  await page.click('.hm-cell[data-key="2026-11-07"]');
  assert.match(await page.textContent('.goal-text'), /уже не успеть/);
  assert.equal(await page.locator('.goal-text.late').count(), 1);
});

// ---------- Годы и графики ----------

test('переключатель года показывает календарный год и запоминается', async () => {
  await page.click('#demo-btn');
  const years = await page.locator('#year-select option').evaluateAll((o) => o.map((x) => x.value));
  assert.deepEqual(years, ['recent', '2026', '2025']);
  await page.selectOption('#year-select', '2025');
  assert.equal(await page.locator('.hm-cell[data-key="2025-01-01"]').count(), 1);
  assert.equal(await page.locator('.hm-cell[data-key="2025-12-31"]').count(), 1);
  // 2024-12-30 — понедельник той же недели, клетка есть, но скрыта
  assert.equal(await page.locator('.hm-cell.outside[data-key="2024-12-30"]').isVisible(), false);
  assert.equal(await page.textContent('#monthly-title'), 'По месяцам · 2025');
  await page.reload();
  assert.equal(await page.inputValue('#year-select'), '2025');
  await page.selectOption('#year-select', 'recent');
  assert.equal(await page.locator(`.hm-cell[data-key="${TODAY}"]`).count(), 1);
});

test('в календарном году можно редактировать историю привычки', async () => {
  await addHabit('Бег');
  await page.click('.habit .habit-name');
  await page.selectOption('#year-select', '2026');
  await page.click('.hm-cell[data-key="2026-02-14"]');
  assert.equal(await page.getAttribute('.hm-cell[data-key="2026-02-14"]', 'data-count'), '1');
  assert.equal(await page.locator('.hm-cell[data-key="2026-11-07"]').isDisabled(), true);
});

test('графики по месяцам и дням недели', async () => {
  await page.click('#demo-btn');
  assert.equal(await page.locator('#monthly .ch-bar').count(), 12);
  assert.equal(await page.locator('#weekdays .ch-bar').count(), 7);
  // декабрь 2026 ещё не наступил — заглушка без столбика
  assert.equal(await page.locator('#monthly .ch-bar.empty').count(), 1);
  assert.equal(await page.locator('#monthly .ch-bar.hl').count(), 1);
  assert.match(await page.textContent('#monthly-note'), /Лучший месяц: .+ \(\d+%\), худший: .+/);
  assert.match(await page.textContent('#weekday-note'), /Чаще всего/);
  // подсказка у столбика
  const title = await page.locator('#monthly .ch-bar title').first().textContent();
  assert.match(title, /январь 2026: \d+ из \d+/);
});

test('данные старой версии (v1) мигрируют при запуске', async () => {
  const v1 = {
    version: 1,
    habits: [{ id: 'old', name: 'Старая привычка', color: '#1971c2', createdAt: '2026-10-01' }],
    checks: { old: ['2026-11-02', '2026-11-03'] },
  };
  await page.evaluate((data) => {
    localStorage.clear();
    localStorage.setItem('habit-heatmap:v1', JSON.stringify(data));
  }, v1);
  await page.reload();
  assert.equal(await page.textContent('.habit .habit-name'), 'Старая привычка');
  assert.equal(await page.textContent('.habit .goal-pill'), '2/7');
  await page.click('.habit .check'); // любое изменение сохраняет уже v2
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('habit-heatmap:v2')));
  assert.equal(saved.version, 2);
  assert.equal(saved.habits[0].goal, 7);
});
