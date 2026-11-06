import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak, longestStreak, completionRate, weeklyCounts, summarize } from '../../js/stats.js';

const TODAY = '2026-11-06';

test('currentStreak считает от сегодня', () => {
  assert.equal(currentStreak(['2026-11-04', '2026-11-05', '2026-11-06'], TODAY), 3);
});

test('currentStreak не обрывается, если сегодня ещё не отмечено', () => {
  assert.equal(currentStreak(['2026-11-04', '2026-11-05'], TODAY), 2);
});

test('currentStreak = 0, если пропущено вчера и сегодня', () => {
  assert.equal(currentStreak(['2026-11-03', '2026-11-04'], TODAY), 0);
  assert.equal(currentStreak([], TODAY), 0);
});

test('currentStreak переходит через границу месяца', () => {
  assert.equal(currentStreak(['2026-10-30', '2026-10-31', '2026-11-01'], '2026-11-01'), 3);
});

test('longestStreak находит самую длинную серию', () => {
  const keys = ['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-09'];
  assert.equal(longestStreak(keys), 3);
  assert.equal(longestStreak([]), 0);
  assert.equal(longestStreak(['2026-01-01']), 1);
  // несортированный ввод и дубли
  assert.equal(longestStreak(['2026-01-03', '2026-01-01', '2026-01-02', '2026-01-02']), 3);
  // через Новый год
  assert.equal(longestStreak(['2025-12-31', '2026-01-01']), 2);
});

test('completionRate считает долю дней в интервале', () => {
  const keys = ['2026-11-01', '2026-11-02', '2026-10-01'];
  assert.equal(completionRate(keys, '2026-11-01', '2026-11-04'), 0.5);
  assert.equal(completionRate([], '2026-11-01', '2026-11-04'), 0);
  assert.equal(completionRate(keys, '2026-11-05', '2026-11-01'), 0);
});

test('weeklyCounts группирует по неделям с понедельника', () => {
  const keys = ['2026-11-02', '2026-11-06', '2026-10-26', '2026-10-25'];
  const weeks = weeklyCounts(keys, TODAY, 3);
  assert.deepEqual(weeks, [
    { start: '2026-10-19', count: 1 }, // 25 октября — воскресенье
    { start: '2026-10-26', count: 1 },
    { start: '2026-11-02', count: 2 },
  ]);
});

test('summarize: процент за 30 дней учитывает дату создания привычки', () => {
  const keys = ['2026-11-05', '2026-11-06'];
  const young = summarize(keys, TODAY, '2026-11-05');
  assert.equal(young.rate30, 1);
  assert.equal(young.current, 2);
  assert.equal(young.longest, 2);
  assert.equal(young.total, 2);
  const old = summarize(keys, TODAY, '2025-01-01');
  assert.equal(old.rate30, 2 / 30);
});
