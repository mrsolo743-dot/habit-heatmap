// Построение сетки тепловой карты (как у GitHub): колонки — недели, строки — дни Пн..Вс.
// buildGrid — чистая функция, renderHeatmap — отрисовка в DOM.

import { addDays, startOfWeek, monthShort, formatKey, parseKey } from './dates.js';

export const LEVELS = 4; // уровни 1..4 плюс 0 = пусто

/** Уровень яркости ячейки 0..4 относительно максимума. */
export function levelFor(count, max) {
  if (!count || count <= 0 || !max) return 0;
  if (max === 1) return LEVELS;
  return Math.min(LEVELS, Math.max(1, Math.ceil((count / max) * LEVELS)));
}

/**
 * @param {Record<string, number>} counts  количество отметок по дням
 * @param {string} endKey  последний день (обычно сегодня)
 * @param {number} weeks   сколько недель показывать
 * @param {number|null} maxOverride  максимум для шкалы (например, число привычек)
 */
export function buildGrid(counts, endKey, weeks = 53, maxOverride = null) {
  const firstMonday = addDays(startOfWeek(endKey), -7 * (weeks - 1));
  const lastDay = addDays(firstMonday, weeks * 7 - 1);
  const visible = Object.entries(counts).filter(([k]) => k >= firstMonday && k <= endKey);
  const max = maxOverride ?? Math.max(0, ...visible.map(([, v]) => v));

  const columns = [];
  const monthLabels = [];
  let prevMonth = null;
  for (let w = 0; w < weeks; w += 1) {
    const monday = addDays(firstMonday, w * 7);
    const cells = [];
    for (let d = 0; d < 7; d += 1) {
      const key = addDays(monday, d);
      const count = counts[key] ?? 0;
      cells.push({ key, count, level: levelFor(count, max), future: key > endKey });
    }
    // Подпись месяца ставим на колонку, где встречается 1-е число (или на первую колонку).
    const firstOfMonth = cells.find((c) => parseKey(c.key).getDate() === 1);
    const labelKey = w === 0 ? monday : firstOfMonth?.key;
    if (labelKey) {
      const month = monthShort(labelKey);
      if (month !== prevMonth) monthLabels.push({ week: w, label: month });
      prevMonth = month;
    }
    columns.push(cells);
  }
  // Подпись первой колонки убираем, если следующая слишком близко и они наложатся.
  if (monthLabels.length > 1 && monthLabels[1].week - monthLabels[0].week < 3) monthLabels.shift();
  return { columns, monthLabels, max, start: firstMonday, end: lastDay };
}

const WEEKDAYS = ['Пн', '', 'Ср', '', 'Пт', '', ''];

/** Рисует сетку в контейнер. onCellClick(key) вызывается по клику на прошедший день. */
export function renderHeatmap(container, grid, { color = '#2f9e44', onCellClick, titleFor } = {}) {
  container.innerHTML = '';
  container.style.setProperty('--hm-color', color);

  const months = document.createElement('div');
  months.className = 'hm-months';
  months.style.gridTemplateColumns = `repeat(${grid.columns.length}, var(--cell))`;
  for (const { week, label } of grid.monthLabels) {
    const span = document.createElement('span');
    span.textContent = label;
    span.style.gridColumn = `${week + 1} / span 3`;
    span.style.gridRow = '1'; // все подписи в одной строке

    months.append(span);
  }

  const body = document.createElement('div');
  body.className = 'hm-body';

  const days = document.createElement('div');
  days.className = 'hm-weekdays';
  for (const label of WEEKDAYS) {
    const s = document.createElement('span');
    s.textContent = label;
    days.append(s);
  }

  const cells = document.createElement('div');
  cells.className = 'hm-grid';
  cells.setAttribute('role', 'grid');
  cells.style.gridTemplateColumns = `repeat(${grid.columns.length}, var(--cell))`;
  for (const column of grid.columns) {
    for (const cell of column) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `hm-cell lvl-${cell.level}${cell.future ? ' future' : ''}`;
      el.dataset.key = cell.key;
      el.dataset.count = String(cell.count);
      el.title = titleFor ? titleFor(cell) : `${formatKey(cell.key)}: ${cell.count}`;
      el.setAttribute('aria-label', el.title);
      if (cell.future) {
        el.disabled = true;
      } else if (onCellClick) {
        el.addEventListener('click', () => onCellClick(cell.key));
      }
      cells.append(el);
    }
  }

  body.append(days, cells);
  container.append(months, body);
}
