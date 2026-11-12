// Модель данных и операции над ней. Все функции чистые: принимают состояние и возвращают новое.
// Сохранение в localStorage вынесено в createStorage(), чтобы логику можно было тестировать в Node.

import { isValidKey, toKey } from './dates.js';

export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'habit-heatmap:v2';
/** Ключи прошлых версий: читаются, если нового ключа ещё нет (старые данные мигрируются). */
export const LEGACY_STORAGE_KEYS = ['habit-heatmap:v1'];
export const MAX_NAME_LENGTH = 60;
/** Цель — сколько раз в неделю выполнять привычку. 7 = каждый день. */
export const DEFAULT_GOAL = 7;
export const PALETTE = ['#2f9e44', '#1971c2', '#e8590c', '#9c36b5', '#c2255c', '#0c8599'];

/**
 * @typedef {{id: string, name: string, color: string, createdAt: string, goal: number}} Habit
 * @typedef {{version: number, habits: Habit[], checks: Record<string, string[]>}} State
 */

export function emptyState() {
  return { version: SCHEMA_VERSION, habits: [], checks: {} };
}

let counter = 0;
export function makeId() {
  counter += 1;
  return `h_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function cleanName(name) {
  const value = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!value) throw new Error('Название привычки не может быть пустым');
  if (value.length > MAX_NAME_LENGTH) {
    throw new Error(`Название длиннее ${MAX_NAME_LENGTH} символов`);
  }
  return value;
}

function cleanColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color ?? '') ? color.toLowerCase() : PALETTE[0];
}

/** Цель: целое 1..7. Пустое значение — цель по умолчанию, остальное — ошибка. */
export function cleanGoal(goal) {
  if (goal === undefined || goal === null || goal === '') return DEFAULT_GOAL;
  const n = Number(goal);
  if (!Number.isInteger(n) || n < 1 || n > 7) {
    throw new Error('Цель должна быть от 1 до 7 раз в неделю');
  }
  return n;
}

function assertUniqueName(state, name, exceptId = null) {
  const lower = name.toLocaleLowerCase('ru');
  if (state.habits.some((h) => h.id !== exceptId && h.name.toLocaleLowerCase('ru') === lower)) {
    throw new Error(`Привычка «${name}» уже есть`);
  }
}

/** Добавляет привычку. Возвращает { state, habit }. */
export function addHabit(state, { name, color, createdAt, goal, id = makeId() }) {
  const clean = cleanName(name);
  assertUniqueName(state, clean);
  const habit = {
    id,
    name: clean,
    color: cleanColor(color ?? PALETTE[state.habits.length % PALETTE.length]),
    createdAt: createdAt ?? toKey(new Date()),
    goal: cleanGoal(goal),
  };
  return {
    state: { ...state, habits: [...state.habits, habit], checks: { ...state.checks, [id]: [] } },
    habit,
  };
}

export function updateHabit(state, id, { name, color, goal }) {
  const habit = getHabit(state, id);
  const next = { ...habit };
  if (name !== undefined) {
    next.name = cleanName(name);
    assertUniqueName(state, next.name, id);
  }
  if (color !== undefined) next.color = cleanColor(color);
  if (goal !== undefined) next.goal = cleanGoal(goal);
  return { ...state, habits: state.habits.map((h) => (h.id === id ? next : h)) };
}

export function deleteHabit(state, id) {
  getHabit(state, id);
  const checks = { ...state.checks };
  delete checks[id];
  return { ...state, habits: state.habits.filter((h) => h.id !== id), checks };
}

/** Перемещает привычку на позицию вверх (-1) или вниз (+1). */
export function moveHabit(state, id, delta) {
  const idx = state.habits.findIndex((h) => h.id === id);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= state.habits.length) return state;
  const habits = [...state.habits];
  [habits[idx], habits[target]] = [habits[target], habits[idx]];
  return { ...state, habits };
}

export function getHabit(state, id) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) throw new Error(`Привычка не найдена: ${id}`);
  return habit;
}

export function isChecked(state, id, dayKey) {
  return (state.checks[id] ?? []).includes(dayKey);
}

/** Переключает отметку за день. Даты хранятся отсортированными и без дублей. */
export function toggleCheck(state, id, dayKey) {
  getHabit(state, id);
  if (!isValidKey(dayKey)) throw new Error(`Неверная дата: ${dayKey}`);
  const current = state.checks[id] ?? [];
  const next = current.includes(dayKey)
    ? current.filter((k) => k !== dayKey)
    : [...current, dayKey].sort();
  return { ...state, checks: { ...state.checks, [id]: next } };
}

/** Количество выполненных привычек по дням: { 'YYYY-MM-DD': n }. Если передан id — только по нему. */
export function countsByDay(state, id = null) {
  const ids = id ? [id] : state.habits.map((h) => h.id);
  const counts = {};
  for (const hid of ids) {
    for (const key of state.checks[hid] ?? []) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// ---------- Экспорт / импорт ----------

export function exportJSON(state, now = new Date()) {
  return JSON.stringify({ app: 'habit-heatmap', exportedAt: now.toISOString(), ...state }, null, 2);
}

/** Разбирает и проверяет JSON. Бросает понятную ошибку, если данные некорректны. */
export function importJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл не является корректным JSON');
  }
  return normalizeState(data);
}

/**
 * Миграции схемы: MIGRATIONS[n] переводит данные версии n в версию n + 1.
 * Чтобы добавить версию 3, достаточно дописать MIGRATIONS[2] и поднять SCHEMA_VERSION.
 */
export const MIGRATIONS = {
  // v1 → v2: у привычек появилась недельная цель. Старые привычки считаем ежедневными.
  1: (data) => ({
    ...data,
    version: 2,
    habits: Array.isArray(data.habits)
      ? data.habits.map((h) => (h && typeof h === 'object' ? { goal: DEFAULT_GOAL, ...h } : h))
      : data.habits,
  }),
};

/** Доводит данные любой поддерживаемой версии до текущей. */
export function migrate(data) {
  if (!data || typeof data !== 'object') throw new Error('Пустые или неверные данные');
  let current = data;
  while (current.version !== SCHEMA_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) throw new Error(`Неподдерживаемая версия данных: ${current.version}`);
    current = step(current);
  }
  return current;
}

export function normalizeState(input) {
  const data = migrate(input);
  if (!Array.isArray(data.habits)) throw new Error('Поле habits должно быть массивом');

  let state = emptyState();
  for (const raw of data.habits) {
    if (!raw || typeof raw.id !== 'string' || !raw.id) throw new Error('У привычки нет id');
    if (state.habits.some((h) => h.id === raw.id)) throw new Error(`Повторяющийся id: ${raw.id}`);
    ({ state } = addHabit(state, {
      id: raw.id,
      name: raw.name,
      color: raw.color,
      createdAt: isValidKey(raw.createdAt) ? raw.createdAt : undefined,
      goal: raw.goal,
    }));
    const days = data.checks?.[raw.id] ?? [];
    if (!Array.isArray(days)) throw new Error(`Отметки привычки «${raw.name}» должны быть массивом`);
    const bad = days.find((k) => !isValidKey(k));
    if (bad !== undefined) throw new Error(`Неверная дата в отметках: ${bad}`);
    state.checks[raw.id] = [...new Set(days)].sort();
  }
  return state;
}

// ---------- Хранилище ----------

/** Обёртка над localStorage (или любым объектом с getItem/setItem). Не падает, если хранилище недоступно. */
export function createStorage(backend = globalThis.localStorage) {
  return {
    load() {
      try {
        // Сначала текущий ключ, затем ключи старых версий. Старые данные не удаляем:
        // они остаются резервной копией, а при первом сохранении появится ключ v2.
        for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
          const raw = backend?.getItem(key);
          if (raw) return normalizeState(JSON.parse(raw));
        }
        return emptyState();
      } catch (err) {
        console.warn('Не удалось прочитать сохранённые данные:', err.message);
        return emptyState();
      }
    },
    save(state) {
      try {
        backend?.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (err) {
        console.warn('Не удалось сохранить данные:', err.message);
        return false;
      }
    },
  };
}
