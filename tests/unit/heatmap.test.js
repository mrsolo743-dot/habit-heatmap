import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, levelFor } from '../../js/heatmap.js';
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
  const counts = countsByDay(a);
  assert.ok(Object.keys(counts).length > 100);
  assert.ok(Object.keys(counts).every((k) => k <= '2026-11-06'));
  const rnd = seededRandom(1);
  const v = rnd();
  assert.ok(v >= 0 && v < 1);
});
