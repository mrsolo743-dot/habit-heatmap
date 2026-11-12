import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyStats, bestWorstMonth, weekdayStats, availableYears } from '../../js/stats.js';

test('monthlyStats: 12 месяцев, будущие дни и дни до создания не считаются', () => {
  const keys = ['2026-10-01', '2026-10-02', '2026-11-01', '2025-10-01'];
  const months = monthlyStats(keys, 2026, '2026-11-10', '2026-09-21');
  assert.equal(months.length, 12);
  assert.deepEqual(months[0], { month: 0, count: 0, possible: 0, rate: null }); // до создания
  assert.equal(months[8].possible, 10); // 21–30 сентября
  assert.equal(months[9].count, 2);
  assert.equal(months[9].possible, 31);
  assert.equal(months[10].possible, 10); // 1–10 ноября
  assert.equal(months[10].rate, 0.1);
  assert.equal(months[11].possible, 0); // декабрь ещё не наступил
});

test('monthlyStats учитывает високосный февраль', () => {
  const feb24 = monthlyStats([], 2024, '2026-01-01')[1];
  const feb26 = monthlyStats([], 2026, '2027-01-01')[1];
  assert.equal(feb24.possible, 29);
  assert.equal(feb26.possible, 28);
});

test('bestWorstMonth пропускает месяцы без данных', () => {
  const months = [
    { month: 0, rate: null }, { month: 1, rate: 0.5 }, { month: 2, rate: 0.9 }, { month: 3, rate: 0.2 },
  ];
  const { best, worst } = bestWorstMonth(months);
  assert.equal(best.month, 2);
  assert.equal(worst.month, 3);
  assert.deepEqual(bestWorstMonth([{ month: 0, rate: null }]), { best: null, worst: null });
});

test('weekdayStats раскладывает отметки по дням недели', () => {
  // 2–15 ноября 2026: ровно две недели, каждый день недели встречается дважды
  const keys = ['2026-11-02', '2026-11-09', '2026-11-08', '2026-11-04', '2026-10-31'];
  const days = weekdayStats(keys, '2026-11-02', '2026-11-15');
  assert.ok(days.every((d) => d.possible === 2));
  assert.equal(days[0].count, 2); // понедельники
  assert.equal(days[0].rate, 1);
  assert.equal(days[2].count, 1); // среда
  assert.equal(days[6].count, 1); // воскресенье 8-го
  assert.equal(days[5].count, 0); // 31 октября вне диапазона
});

test('weekdayStats на коротком и пустом интервале', () => {
  const days = weekdayStats(['2026-11-11'], '2026-11-11', '2026-11-11');
  assert.equal(days[2].possible, 1);
  assert.equal(days[2].rate, 1);
  assert.equal(days[0].rate, null);
  assert.ok(weekdayStats([], '2026-11-12', '2026-11-11').every((d) => d.possible === 0));
});

test('availableYears — от самой ранней даты до текущего года, новые сверху', () => {
  assert.deepEqual(availableYears(['2024-05-01', '2026-01-01'], '2026-11-11'), [2026, 2025, 2024]);
  assert.deepEqual(availableYears([], '2026-11-11'), [2026]);
  // дата из будущего не создаёт будущих лет
  assert.deepEqual(availableYears(['2027-01-01'], '2026-11-11'), [2026]);
});
