import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toKey, parseKey, isValidKey, addDays, diffDays, weekdayMon, startOfWeek, formatKey, monthShort,
} from '../../js/dates.js';

test('toKey и parseKey взаимно обратны', () => {
  assert.equal(toKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(toKey(parseKey('2024-02-29')), '2024-02-29');
});

test('parseKey отвергает неверный формат и несуществующие даты', () => {
  assert.throws(() => parseKey('2026-1-5'), /формат/);
  assert.throws(() => parseKey('2026-02-30'), /Несуществующая/);
  assert.equal(isValidKey('2025-02-29'), false);
  assert.equal(isValidKey('2024-02-29'), true);
  assert.equal(isValidKey(''), false);
});

test('addDays переходит через границы месяцев и годов', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2026-11-06', 0), '2026-11-06');
});

test('diffDays считает разницу в днях', () => {
  assert.equal(diffDays('2026-01-01', '2026-12-31'), 364);
  assert.equal(diffDays('2026-11-06', '2026-11-01'), -5);
  // через переход на летнее время (в зонах, где он есть) — всё равно целые дни
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
});

test('неделя начинается с понедельника', () => {
  assert.equal(weekdayMon('2026-11-02'), 0); // понедельник
  assert.equal(weekdayMon('2026-11-08'), 6); // воскресенье
  assert.equal(startOfWeek('2026-11-06'), '2026-11-02');
  assert.equal(startOfWeek('2026-11-08'), '2026-11-02');
  assert.equal(startOfWeek('2026-11-02'), '2026-11-02');
});

test('форматирование на русском', () => {
  assert.equal(formatKey('2026-11-06'), '6 ноя 2026');
  assert.equal(monthShort('2026-05-15'), 'май');
});
