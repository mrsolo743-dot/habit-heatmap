// Генератор демо-данных: несколько привычек с правдоподобной историей за год.
// Используется детерминированный ГПСЧ, чтобы демо (и скриншоты) были воспроизводимыми.

import { addDays } from './dates.js';
import { addHabit, emptyState } from './store.js';

/** Mulberry32 — маленький детерминированный генератор случайных чисел. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO = [
  { name: 'Читать 20 минут', color: '#2f9e44', p: 0.78, goal: 7 },
  { name: 'Зарядка', color: '#1971c2', p: 0.6, goal: 4 },
  { name: 'Учить английский', color: '#e8590c', p: 0.5, goal: 3 },
];

// ~1,5 года истории, чтобы в переключателе было два года.
export function demoState(today, days = 520, seed = 42) {
  const rnd = seededRandom(seed);
  let state = emptyState();
  const start = addDays(today, -(days - 1));
  DEMO.forEach((d, i) => {
    let habit;
    ({ state, habit } = addHabit(state, { id: `demo_${i}`, name: d.name, color: d.color, goal: d.goal, createdAt: start }));
    const keys = [];
    let mood = 1; // «полосы» хорошей и плохой мотивации, чтобы карта выглядела живо
    for (let n = 0; n < days; n += 1) {
      if (rnd() < 0.08) mood = mood === 1 ? 0.45 : 1;
      if (rnd() < d.p * mood) keys.push(addDays(start, n));
    }
    state.checks[habit.id] = keys;
  });
  return state;
}
