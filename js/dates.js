// Утилиты для работы с датами в локальном часовом поясе.
// День кодируется строкой-ключом 'YYYY-MM-DD', чтобы не зависеть от времени суток и UTC-сдвигов.

const pad = (n) => String(n).padStart(2, '0');

/** Date -> 'YYYY-MM-DD' (локальная дата). */
export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 'YYYY-MM-DD' -> Date (локальная полночь). Бросает ошибку на неверном формате. */
export function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Неверный формат даты: ${key}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    throw new Error(`Несуществующая дата: ${key}`);
  }
  return date;
}

export function isValidKey(key) {
  try {
    parseKey(key);
    return true;
  } catch {
    return false;
  }
}

/** Сдвигает ключ даты на n дней (n может быть отрицательным). */
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Разница в днях: b - a. Считается через UTC, чтобы переход на летнее время не ломал счёт. */
export function diffDays(a, b) {
  const da = parseKey(a);
  const db = parseKey(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** День недели с понедельника: 0 = Пн ... 6 = Вс. */
export function weekdayMon(key) {
  return (parseKey(key).getDay() + 6) % 7;
}

/** Понедельник недели, в которую попадает дата. */
export function startOfWeek(key) {
  return addDays(key, -weekdayMon(key));
}

export function todayKey(now = new Date()) {
  return toKey(now);
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function monthShort(key) {
  return MONTHS_SHORT[parseKey(key).getMonth()];
}

/** Человекочитаемая дата: '6 ноя 2026'. */
export function formatKey(key) {
  const d = parseKey(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
