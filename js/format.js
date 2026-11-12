// Склонения и подписи для интерфейса. Чистые функции — тестируются в Node.

/** plural(3, ['раз', 'раза', 'раз']) → 'раза'. Правило для русского: 1, 2–4, 5+ (11–14 — «много»). */
export function plural(n, [one, few, many]) {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const TIMES = ['раз', 'раза', 'раз'];
export const DAYS = ['день', 'дня', 'дней'];

/** «каждый день» для 7, иначе «3 раза в неделю». */
export function goalLabel(goal) {
  return goal >= 7 ? 'каждый день' : `${goal} ${plural(goal, TIMES)} в неделю`;
}

/** 0.734 → '73%'. */
export function percent(rate) {
  return `${Math.round(rate * 100)}%`;
}
