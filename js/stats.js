// Статистика по отметкам привычки. На вход — массив ключей дат 'YYYY-MM-DD'.

import { addDays, diffDays, startOfWeek, weekdayMon } from './dates.js';

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

// ---------- Недельные цели ----------

/** Уникальные отметки в интервале [from, to]. */
function countInRange(keys, from, to) {
  return new Set(keys.filter((k) => k >= from && k <= to)).size;
}

/**
 * Прогресс текущей недели (Пн–Вс) относительно цели «goal раз в неделю».
 * daysLeft — сколько дней недели осталось, включая сегодня; reachable — можно ли ещё успеть.
 */
export function weekProgress(keys, today, goal) {
  const start = startOfWeek(today);
  const done = countInRange(keys, start, addDays(start, 6));
  const daysLeft = 7 - diffDays(start, today);
  const doneToday = keys.includes(today);
  const remaining = Math.max(0, goal - done);
  // Сегодня ещё можно отметить, если не отмечено, поэтому сегодняшний день считаем доступным.
  const available = daysLeft - (doneToday ? 1 : 0);
  return { start, done, goal, met: done >= goal, remaining, daysLeft, reachable: remaining <= available };
}

/** Первая неделя, которую имеет смысл оценивать: неделя создания привычки (или первой отметки). */
function firstWeek(keys, createdAt) {
  const candidates = [createdAt, ...keys].filter(Boolean).sort();
  return candidates.length ? startOfWeek(candidates[0]) : null;
}

/**
 * Результаты по завершённым неделям (от старых к новым) начиная с недели создания.
 * Текущая неделя не входит: она ещё не закончилась.
 */
export function goalWeeks(keys, today, goal, createdAt = null) {
  const first = firstWeek(keys, createdAt);
  const thisWeek = startOfWeek(today);
  const result = [];
  if (!first) return result;
  for (let start = first; start < thisWeek; start = addDays(start, 7)) {
    const done = countInRange(keys, start, addDays(start, 6));
    result.push({ start, done, met: done >= goal });
  }
  return result;
}

/**
 * Серия недель подряд с выполненной целью. Текущая неделя добавляется к серии, если цель уже
 * выполнена, и не обрывает её, если ещё нет (неделя не закончилась) — как currentStreak для дней.
 */
export function goalStreak(keys, today, goal, createdAt = null) {
  const weeks = goalWeeks(keys, today, goal, createdAt);
  let streak = weekProgress(keys, today, goal).met ? 1 : 0;
  for (let i = weeks.length - 1; i >= 0 && weeks[i].met; i -= 1) streak += 1;
  return streak;
}

/** Рекордная серия недель с выполненной целью (включая текущую, если цель уже выполнена). */
export function longestGoalStreak(keys, today, goal, createdAt = null) {
  const flags = goalWeeks(keys, today, goal, createdAt).map((w) => w.met);
  flags.push(weekProgress(keys, today, goal).met);
  let best = 0;
  let run = 0;
  for (const met of flags) {
    run = met ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Доля завершённых недель, в которых цель выполнена: { met, total, rate }. */
export function goalSuccess(keys, today, goal, createdAt = null) {
  const weeks = goalWeeks(keys, today, goal, createdAt);
  const met = weeks.filter((w) => w.met).length;
  return { met, total: weeks.length, rate: weeks.length ? met / weeks.length : 0 };
}

// ---------- По месяцам и дням недели ----------

const pad = (n) => String(n).padStart(2, '0');

/**
 * Статистика по 12 месяцам года. possible — сколько дней месяца привычка «могла» быть выполнена:
 * без будущих дней и дней до создания привычки. rate = count / possible (null, если дней нет).
 */
export function monthlyStats(keys, year, today, createdAt = null) {
  const set = new Set(keys);
  const result = [];
  for (let m = 0; m < 12; m += 1) {
    const first = `${year}-${pad(m + 1)}-01`;
    const last = addDays(m === 11 ? `${year + 1}-01-01` : `${year}-${pad(m + 2)}-01`, -1);
    let from = first;
    if (createdAt && createdAt > from) from = createdAt;
    const to = today < last ? today : last;
    let count = 0;
    for (const key of set) if (key >= first && key <= last) count += 1;
    const possible = from <= to ? diffDays(from, to) + 1 : 0;
    result.push({ month: m, count, possible, rate: possible ? Math.min(1, count / possible) : null });
  }
  return result;
}

/** Лучший и худший месяц по проценту выполнения среди месяцев, где были доступные дни. */
export function bestWorstMonth(months) {
  const valid = months.filter((m) => m.rate !== null);
  if (!valid.length) return { best: null, worst: null };
  let best = valid[0];
  let worst = valid[0];
  for (const m of valid) {
    if (m.rate > best.rate) best = m;
    if (m.rate < worst.rate) worst = m;
  }
  return { best, worst };
}

/**
 * Распределение по дням недели (0 = Пн … 6 = Вс) в интервале [from, to]:
 * count — сколько раз выполнено, possible — сколько таких дней было, rate — доля.
 */
export function weekdayStats(keys, from, to) {
  const result = Array.from({ length: 7 }, (_, weekday) => ({ weekday, count: 0, possible: 0, rate: null }));
  if (!from || from > to) return result;
  const set = new Set(keys);
  // Идём по дням недели, а не по каждому дню: первые 7 дней задают день недели, дальше шаг 7.
  for (let i = 0; i < 7; i += 1) {
    let day = addDays(from, i);
    if (day > to) break;
    const bucket = result[weekdayMon(day)];
    for (; day <= to; day = addDays(day, 7)) {
      bucket.possible += 1;
      if (set.has(day)) bucket.count += 1;
    }
  }
  for (const b of result) b.rate = b.possible ? b.count / b.possible : null;
  return result;
}

/** Годы, за которые есть что показать: от самой ранней даты (создание/отметка) до текущего. */
export function availableYears(dates, today) {
  const thisYear = Number(today.slice(0, 4));
  const valid = dates.filter(Boolean).sort();
  const first = valid.length ? Math.min(Number(valid[0].slice(0, 4)), thisYear) : thisYear;
  const years = [];
  for (let y = thisYear; y >= first; y -= 1) years.push(y);
  return years;
}
