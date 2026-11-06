// Статистика по отметкам привычки. На вход — массив ключей дат 'YYYY-MM-DD'.

import { addDays, diffDays, startOfWeek } from './dates.js';

/**
 * Текущая серия: сколько дней подряд привычка выполнялась, считая назад от сегодня.
 * Если сегодня ещё не отмечено, серия не обрывается — считаем от вчера (день ещё не закончился).
 */
export function currentStreak(keys, today) {
  const set = new Set(keys);
  let day = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

/** Самая длинная серия подряд идущих дней за всё время. */
export function longestStreak(keys) {
  const sorted = [...new Set(keys)].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of sorted) {
    run = prev !== null && diffDays(prev, key) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

/** Доля выполненных дней в интервале [from, to] включительно, от 0 до 1. */
export function completionRate(keys, from, to) {
  const total = diffDays(from, to) + 1;
  if (total <= 0) return 0;
  const done = new Set(keys.filter((k) => k >= from && k <= to)).size;
  return done / total;
}

/** Количество отметок по неделям (Пн–Вс) за последние `weeks` недель, от старых к новым. */
export function weeklyCounts(keys, today, weeks = 8) {
  const thisWeek = startOfWeek(today);
  const result = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 6);
    const count = new Set(keys.filter((k) => k >= start && k <= end)).size;
    result.push({ start, count });
  }
  return result;
}

/** Сводка для панели статистики. */
export function summarize(keys, today, createdAt = null) {
  const from30 = addDays(today, -29);
  // Процент за 30 дней считаем с даты создания, если привычка моложе 30 дней.
  const from = createdAt && createdAt > from30 && createdAt <= today ? createdAt : from30;
  return {
    total: new Set(keys).size,
    current: currentStreak(keys, today),
    longest: longestStreak(keys),
    rate30: completionRate(keys, from, today),
  };
}
