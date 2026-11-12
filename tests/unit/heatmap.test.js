import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, buildYearGrid, levelFor } from '../../js/heatmap.js';
import { demoState, seededRandom } from '../../js/demo.js';
import { countsByDay } from '../../js/store.js';

test('levelFor раскладывает значения по 4 уровням', () => {
  assert.equal(levelFor(0, 4), 0);
  assert.equal(levelFor(1, 4), 1);
  assert.equal(levelFor(2, 4), 2);
  assert.equal(levelFor(4, 4), 4);
  assert.equal(levelFor(1, 1), 4);
  assert.equal(levelFor(3, 0), 0);
  assert.equal(levelFor(10, 4), 4);
});

test('buildGrid строит колонки-недели по 7 дней, начиная с понедельника', () => {
  const grid = buildGrid({}, '2026-11-06', 53);
  assert.equal(grid.columns.length, 53);
  assert.ok(grid.columns.every((c) => c.length === 7));
  assert.equal(grid.columns.at(-1)[0].key, '2026-11-02');
  assert.equal(grid.start, '2025-11-03');
  assert.equal(grid.end, '2026-11-08');
});

test('дни после endKey помечаются как будущие', () => {
  const last = buildGrid({}, '2026-11-06', 1).columns[0];
  assert.deepEqual(last.map((c) => c.future), [false, false, false, false, false, true, true]);
});

test('уровни считаются относительно максимума или переданного значения', () => {
  const counts = { '2026-11-05': 1, '2026-11-06': 2 };
  const auto = buildGrid(counts, '2026-11-06', 1).columns[0];
  assert.equal(auto[3].level, 2); // 1 из 2
  assert.equal(auto[4].level, 4);
  const fixed = buildGrid(counts, '2026-11-06', 1, 4).columns[0];
  assert.equal(fixed[3].level, 1);
  assert.equal(fixed[4].level, 2);
});

test('подписи месяцев не повторяются и идут по порядку', () => {
  const grid = buildGrid({}, '2026-11-06', 53);
  const labels = grid.monthLabels.map((m) => m.label);
  assert.equal(labels[0], 'ноя');
  assert.ok(labels.includes('янв'));
  for (let i = 1; i < labels.length; i += 1) assert.notEqual(labels[i], labels[i - 1]);
  const weeks = grid.monthLabels.map((m) => m.week);
  assert.deepEqual(weeks, [...weeks].sort((a, b) => a - b));
});

test('слишком близкие подписи месяцев не накладываются', () => {
  // при любой ширине карты первые две подписи стоят минимум в 3 неделях друг от друга
  for (let weeks = 12; weeks <= 53; weeks += 1) {
    const grid = buildGrid({}, '2026-11-06', weeks);
    const [first, second] = grid.monthLabels;
    if (second) assert.ok(second.week - first.week >= 3, `weeks=${weeks}`);
  }
});

test('демо-данные детерминированы и корректны', () => {
  const a = demoState('2026-11-06');
  const b = demoState('2026-11-06');
  assert.deepEqual(a, b);
  assert.equal(a.habits.length, 3);
  assert.deepEqual(a.habits.map((h) => h.goal), [7, 4, 3]);
  const counts = countsByDay(a);
  assert.ok(Object.keys(counts).length > 100);
  assert.ok(Object.keys(counts).every((k) => k <= '2026-11-06'));
  const rnd = seededRandom(1);
  const v = rnd();
  assert.ok(v >= 0 && v < 1);
});

test('buildYearGrid покрывает календарный год целыми неделями', () => {
  const grid = buildYearGrid({}, 2025, '2026-11-11');
  // 1 января 2025 — среда, 31 декабря 2025 — среда
  assert.equal(grid.start, '2024-12-30');
  assert.equal(grid.end, '2026-01-04');
  assert.equal(grid.columns.length, 53);
  assert.equal(grid.year, 2025);
  const cells = grid.columns.flat();
  assert.equal(cells.filter((c) => !c.outside).length, 365);
  assert.deepEqual(cells.filter((c) => c.outside).map((c) => c.key),
    ['2024-12-30', '2024-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.ok(cells.every((c) => !c.future), 'прошлый год целиком в прошлом');
  assert.equal(grid.monthLabels[0].label, 'янв');
  assert.equal(grid.monthLabels.at(-1).label, 'дек');
});

test('buildYearGrid: високосный год, будущие дни и отметки соседних лет', () => {
  const counts = { '2023-12-31': 1, '2024-02-29': 1, '2025-01-01': 1 };
  const grid = buildYearGrid(counts, 2024, '2024-06-15');
  const cells = grid.columns.flat();
  assert.equal(cells.filter((c) => !c.outside).length, 366);
  const byKey = Object.fromEntries(cells.map((c) => [c.key, c]));
  assert.equal(byKey['2024-02-29'].count, 1);
  assert.equal(byKey['2024-02-29'].level, 4);
  assert.equal(byKey['2025-01-01'].count, 0, 'отметки следующего года не попадают в сетку');
  assert.equal(byKey['2024-06-16'].future, true);
  assert.equal(byKey['2024-06-15'].future, false);
  // 2026: 1 января — четверг, 31 декабря — четверг → 53 колонки
  assert.equal(buildYearGrid({}, 2026, '2026-11-11').columns.length, 53);
  // 2024 начинается в понедельник: первая колонка без «чужих» дней
  assert.ok(buildYearGrid({}, 2024, '2026-01-01').columns[0].every((c) => !c.outside));
});
