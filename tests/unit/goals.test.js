import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekProgress, goalWeeks, goalStreak, longestGoalStreak, goalSuccess,
} from '../../js/stats.js';

// 11 ноября 2026 — среда. Неделя: 9–15 ноября.
const TODAY = '2026-11-11';

test('weekProgress считает отметки текущей недели с понедельника', () => {
  const keys = ['2026-11-08', '2026-11-09', '2026-11-10']; // 8-е — воскресенье прошлой недели
  const p = weekProgress(keys, TODAY, 3);
  assert.equal(p.start, '2026-11-09');
  assert.equal(p.done, 2);
  assert.equal(p.met, false);
  assert.equal(p.remaining, 1);
  assert.equal(p.daysLeft, 5); // ср, чт, пт, сб, вс
  assert.equal(p.reachable, true);
});

test('weekProgress: цель выполнена, лишние отметки не дают отрицательный остаток', () => {
  const p = weekProgress(['2026-11-09', '2026-11-10', '2026-11-11'], TODAY, 2);
  assert.equal(p.met, true);
  assert.equal(p.remaining, 0);
});

test('weekProgress: в воскресенье с 0 отметками цель 2 уже недостижима', () => {
  const p = weekProgress([], '2026-11-15', 2);
  assert.equal(p.daysLeft, 1);
  assert.equal(p.reachable, false);
  // а цель 1 ещё можно успеть сегодня
  assert.equal(weekProgress([], '2026-11-15', 1).reachable, true);
  // если сегодня уже отмечено, этот день больше не «свободен»
  assert.equal(weekProgress(['2026-11-15'], '2026-11-15', 3).reachable, false);
});

test('goalWeeks возвращает завершённые недели с недели создания', () => {
  const weeks = goalWeeks(['2026-10-27', '2026-10-28', '2026-11-03'], TODAY, 2, '2026-10-28');
  assert.deepEqual(weeks, [
    { start: '2026-10-26', done: 2, met: true },
    { start: '2026-11-02', done: 1, met: false },
  ]);
  assert.deepEqual(goalWeeks([], TODAY, 3, null), []);
  // привычка создана на этой неделе — завершённых недель нет
  assert.deepEqual(goalWeeks([], TODAY, 3, '2026-11-10'), []);
});

test('goalStreak: незавершённая текущая неделя не обрывает серию', () => {
  const keys = [
    '2026-10-26', '2026-10-27', // неделя 26.10: 2
    '2026-11-02', '2026-11-04', // неделя 02.11: 2
  ];
  assert.equal(goalStreak(keys, TODAY, 2, '2026-10-26'), 2);
  // на текущей неделе цель уже выполнена — она добавляется к серии
  assert.equal(goalStreak([...keys, '2026-11-09', '2026-11-10'], TODAY, 2, '2026-10-26'), 3);
  // провал на прошлой неделе обнуляет серию
  assert.equal(goalStreak(['2026-10-26', '2026-10-27', '2026-11-02'], TODAY, 2, '2026-10-26'), 0);
});

test('longestGoalStreak находит рекорд среди недель', () => {
  const keys = [
    '2026-10-05', '2026-10-12', '2026-10-19', // 3 недели по 1 разу
    // 26.10 — пропуск
    '2026-11-02',
  ];
  assert.equal(longestGoalStreak(keys, TODAY, 1, '2026-10-05'), 3);
  assert.equal(longestGoalStreak([], TODAY, 1, '2026-10-05'), 0);
});

test('goalSuccess считает долю недель с выполненной целью', () => {
  const keys = ['2026-10-26', '2026-11-02', '2026-11-03'];
  const s = goalSuccess(keys, TODAY, 2, '2026-10-26');
  assert.deepEqual(s, { met: 1, total: 2, rate: 0.5 });
  assert.deepEqual(goalSuccess([], TODAY, 2, '2026-11-10'), { met: 0, total: 0, rate: 0 });
});

test('цель 7 = каждый день', () => {
  const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
  assert.equal(goalStreak(week, TODAY, 7, '2026-11-02'), 1);
  assert.equal(goalStreak(week.slice(1), TODAY, 7, '2026-11-02'), 0);
});
