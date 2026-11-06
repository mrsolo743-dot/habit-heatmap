import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, addHabit, updateHabit, deleteHabit, moveHabit, toggleCheck, isChecked,
  countsByDay, exportJSON, importJSON, createStorage, STORAGE_KEY, MAX_NAME_LENGTH,
} from '../../js/store.js';

function withHabits(...names) {
  let state = emptyState();
  const ids = [];
  for (const name of names) {
    const r = addHabit(state, { name, id: `id_${name}`, createdAt: '2026-01-01' });
    state = r.state;
    ids.push(r.habit.id);
  }
  return { state, ids };
}

test('addHabit добавляет привычку и чистит название', () => {
  const { state, habit } = addHabit(emptyState(), { name: '  Читать   книгу ', color: '#ABCDEF' });
  assert.equal(state.habits.length, 1);
  assert.equal(habit.name, 'Читать книгу');
  assert.equal(habit.color, '#abcdef');
  assert.deepEqual(state.checks[habit.id], []);
});

test('addHabit не мутирует исходное состояние', () => {
  const initial = emptyState();
  addHabit(initial, { name: 'Бег' });
  assert.equal(initial.habits.length, 0);
});

test('addHabit валидирует название', () => {
  assert.throws(() => addHabit(emptyState(), { name: '   ' }), /пустым/);
  assert.throws(() => addHabit(emptyState(), { name: 'x'.repeat(MAX_NAME_LENGTH + 1) }), /длиннее/);
  const { state } = withHabits('Бег');
  assert.throws(() => addHabit(state, { name: 'бег' }), /уже есть/);
});

test('неверный цвет заменяется цветом по умолчанию', () => {
  const { habit } = addHabit(emptyState(), { name: 'A', color: 'red' });
  assert.match(habit.color, /^#[0-9a-f]{6}$/);
});

test('toggleCheck ставит и снимает отметку, даты отсортированы', () => {
  let { state, ids: [id] } = withHabits('Бег');
  state = toggleCheck(state, id, '2026-11-06');
  state = toggleCheck(state, id, '2026-11-01');
  assert.deepEqual(state.checks[id], ['2026-11-01', '2026-11-06']);
  assert.equal(isChecked(state, id, '2026-11-06'), true);
  state = toggleCheck(state, id, '2026-11-06');
  assert.equal(isChecked(state, id, '2026-11-06'), false);
  assert.throws(() => toggleCheck(state, id, '06.11.2026'), /Неверная дата/);
  assert.throws(() => toggleCheck(state, 'nope', '2026-11-06'), /не найдена/);
});

test('updateHabit переименовывает и проверяет уникальность', () => {
  const { state, ids: [a] } = withHabits('Бег', 'Йога');
  const next = updateHabit(state, a, { name: 'Бег трусцой', color: '#000000' });
  assert.equal(next.habits[0].name, 'Бег трусцой');
  assert.equal(next.habits[0].color, '#000000');
  assert.throws(() => updateHabit(state, a, { name: 'йога' }), /уже есть/);
  // можно «переименовать» в то же имя
  assert.doesNotThrow(() => updateHabit(state, a, { name: 'Бег' }));
});

test('deleteHabit удаляет привычку вместе с отметками', () => {
  let { state, ids: [a, b] } = withHabits('Бег', 'Йога');
  state = toggleCheck(state, a, '2026-11-06');
  state = deleteHabit(state, a);
  assert.deepEqual(state.habits.map((h) => h.id), [b]);
  assert.equal(state.checks[a], undefined);
});

test('moveHabit меняет порядок и игнорирует выход за границы', () => {
  const { state, ids: [a, b, c] } = withHabits('A', 'B', 'C');
  assert.deepEqual(moveHabit(state, c, -1).habits.map((h) => h.id), [a, c, b]);
  assert.equal(moveHabit(state, a, -1), state);
  assert.equal(moveHabit(state, c, 1), state);
});

test('countsByDay суммирует по всем привычкам или по одной', () => {
  let { state, ids: [a, b] } = withHabits('A', 'B');
  state = toggleCheck(state, a, '2026-11-05');
  state = toggleCheck(state, a, '2026-11-06');
  state = toggleCheck(state, b, '2026-11-06');
  assert.deepEqual(countsByDay(state), { '2026-11-05': 1, '2026-11-06': 2 });
  assert.deepEqual(countsByDay(state, b), { '2026-11-06': 1 });
});

test('экспорт → импорт сохраняет данные', () => {
  let { state, ids: [a] } = withHabits('Бег', 'Йога');
  state = toggleCheck(state, a, '2026-11-06');
  const restored = importJSON(exportJSON(state));
  assert.deepEqual(restored, state);
});

test('импорт отклоняет некорректные данные с понятной ошибкой', () => {
  assert.throws(() => importJSON('{oops'), /JSON/);
  assert.throws(() => importJSON('{"version": 99, "habits": []}'), /версия/);
  assert.throws(() => importJSON('{"version": 1, "habits": {}}'), /массивом/);
  assert.throws(
    () => importJSON(JSON.stringify({ version: 1, habits: [{ id: 'a', name: 'A' }], checks: { a: ['bad'] } })),
    /Неверная дата/,
  );
  assert.throws(
    () => importJSON(JSON.stringify({ version: 1, habits: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] })),
    /Повторяющийся id/,
  );
});

test('импорт убирает дубли дат и сортирует их', () => {
  const s = importJSON(JSON.stringify({
    version: 1,
    habits: [{ id: 'a', name: 'A', color: '#111111', createdAt: '2026-01-01' }],
    checks: { a: ['2026-11-06', '2026-11-01', '2026-11-06'] },
  }));
  assert.deepEqual(s.checks.a, ['2026-11-01', '2026-11-06']);
});

test('createStorage сохраняет и загружает, а при порче данных возвращает пустое состояние', () => {
  const mem = new Map();
  const backend = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const storage = createStorage(backend);
  assert.deepEqual(storage.load(), emptyState());

  const { state } = withHabits('Бег');
  assert.equal(storage.save(state), true);
  assert.deepEqual(storage.load(), state);

  mem.set(STORAGE_KEY, 'not json');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(storage.load(), emptyState());
    const broken = createStorage({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
    assert.equal(broken.save(state), false);
  } finally {
    console.warn = warn;
  }
});
