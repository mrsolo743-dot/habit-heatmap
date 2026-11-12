// Точка входа: связывает модель (store), статистику (stats) и отрисовку (heatmap) с DOM.

import { todayKey, formatKey, isValidKey, addDays } from './dates.js';
import {
  createStorage, addHabit, updateHabit, deleteHabit, moveHabit, toggleCheck, isChecked,
  countsByDay, exportJSON, importJSON, PALETTE,
} from './store.js';
import {
  summarize, weeklyCounts, weekProgress, goalStreak, longestGoalStreak, goalSuccess,
  monthlyStats, bestWorstMonth, weekdayStats, availableYears,
} from './stats.js';
import { buildGrid, buildYearGrid, renderHeatmap } from './heatmap.js';
import { barChartSVG } from './charts.js';
import { plural, goalLabel, percent, TIMES, DAYS } from './format.js';
import { demoState } from './demo.js';

const ALL = '__all__';
const THEME_KEY = 'habit-heatmap:theme';
const VIEW_KEY = 'habit-heatmap:view';
const YEAR_KEY = 'habit-heatmap:year';
const RECENT = 'recent'; // «последние 12 месяцев» — режим карты по умолчанию
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

// ?today=YYYY-MM-DD позволяет «зафиксировать» дату — удобно для тестов и скриншотов.
const params = new URLSearchParams(location.search);
const TODAY = isValidKey(params.get('today') ?? '') ? params.get('today') : todayKey();

const storage = createStorage(safeLocalStorage());
let state = params.has('demo') ? demoState(TODAY) : storage.load();
let view = readPref(VIEW_KEY) ?? ALL;
let year = readPref(YEAR_KEY) ?? RECENT;

const $ = (sel) => document.querySelector(sel);
const els = {
  form: $('#add-form'),
  name: $('#habit-name'),
  color: $('#habit-color'),
  goal: $('#habit-goal'),
  year: $('#year-select'),
  goalPanel: $('#goal-panel'),
  goalSelect: $('#goal-select'),
  goalProgress: $('#goal-progress'),
  goalStats: $('#goal-stats'),
  monthly: $('#monthly'),
  monthlyTitle: $('#monthly-title'),
  monthlyNote: $('#monthly-note'),
  weekdays: $('#weekdays'),
  weekdayTitle: $('#weekday-title'),
  weekdayNote: $('#weekday-note'),
  formError: $('#form-error'),
  list: $('#habit-list'),
  empty: $('#empty-hint'),
  select: $('#view-select'),
  heatmap: $('#heatmap'),
  hint: $('#map-hint'),
  legend: $('.legend'),
  stats: $('#stats'),
  weekly: $('#weekly'),
  toast: $('#toast'),
  today: $('#today-label'),
};

// ---------- Состояние ----------

function commit(next, message) {
  state = next;
  storage.save(state);
  render();
  if (message) toast(message);
}

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPref(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно — не критично */
  }
}

// ---------- Отрисовка ----------

function render() {
  if (view !== ALL && !state.habits.some((h) => h.id === view)) view = ALL;
  els.today.textContent = `· ${formatKey(TODAY)}`;
  renderList();
  renderSelect();
  renderYearSelect();
  renderMap();
}

function renderList() {
  els.list.innerHTML = '';
  els.empty.hidden = state.habits.length > 0;
  state.habits.forEach((habit, idx) => {
    const keys = state.checks[habit.id] ?? [];
    const { current } = summarize(keys, TODAY, habit.createdAt);
    const done = isChecked(state, habit.id, TODAY);
    const week = weekProgress(keys, TODAY, habit.goal);

    const li = document.createElement('li');
    li.className = `habit${view === habit.id ? ' selected' : ''}`;
    li.dataset.id = habit.id;
    li.style.setProperty('--habit-color', habit.color);
    li.innerHTML = `
      <label class="check">
        <input type="checkbox" class="today-check" ${done ? 'checked' : ''} aria-label="Выполнено сегодня">
        <span class="box"></span>
      </label>
      <button type="button" class="habit-name" title="Показать на карте"></button>
      <span class="goal-pill${week.met ? ' met' : ''}" title="Эта неделя: ${week.done} из ${week.goal} (цель — ${goalLabel(habit.goal)})">${week.done}/${week.goal}</span>
      <span class="streak" title="Текущая серия">${current > 0 ? `🔥 ${current}` : ''}</span>
      <span class="habit-actions">
        <button type="button" class="icon up" title="Выше" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="icon down" title="Ниже" ${idx === state.habits.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="icon rename" title="Переименовать">✎</button>
        <button type="button" class="icon delete" title="Удалить">✕</button>
      </span>`;
    li.querySelector('.habit-name').textContent = habit.name; // textContent — защита от XSS
    els.list.append(li);
  });
}

function renderSelect() {
  els.select.innerHTML = '';
  const options = [{ id: ALL, name: 'Все привычки' }, ...state.habits];
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.name;
    els.select.append(opt);
  }
  els.select.value = view;
}

/** Все даты, по которым видно, с какого года есть данные. */
function allDates() {
  return [...state.habits.map((h) => h.createdAt), ...Object.values(state.checks).flat()];
}

function renderYearSelect() {
  const years = availableYears(allDates(), TODAY);
  if (year !== RECENT && !years.includes(Number(year))) year = RECENT;
  els.year.innerHTML = '';
  const options = [[RECENT, 'Последние 12 мес.'], ...years.map((y) => [String(y), `${y} год`])];
  for (const [value, label] of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    els.year.append(opt);
  }
  els.year.value = String(year);
}

/** Год для графиков по месяцам и дням недели: выбранный или текущий. */
function chartYear() {
  return year === RECENT ? Number(TODAY.slice(0, 4)) : Number(year);
}

function renderMap() {
  const single = view !== ALL ? state.habits.find((h) => h.id === view) : null;
  const counts = countsByDay(state, single?.id ?? null);
  const total = state.habits.length;
  const max = single ? 1 : Math.max(total, 1);
  let grid;
  if (year === RECENT) {
    grid = buildGrid(counts, TODAY, weeksToShow(), max);
  } else {
    grid = buildYearGrid(counts, Number(year), TODAY, max);
    sizeCells(grid.columns.length, 10);
  }
  const scrollToEnd = year === RECENT || Number(year) === Number(TODAY.slice(0, 4));

  renderHeatmap(els.heatmap, grid, {
    color: single?.color ?? '#2f9e44',
    onCellClick: single ? (key) => onToggle(single.id, key) : null,
    titleFor: (cell) =>
      single
        ? `${formatKey(cell.key)}: ${cell.count ? 'выполнено' : 'не выполнено'}`
        : `${formatKey(cell.key)}: ${cell.count} из ${total}`,
  });

  // На узком экране год не помещается: для текущего года показываем самые свежие недели.
  els.heatmap.scrollLeft = scrollToEnd ? els.heatmap.scrollWidth : 0;

  els.legend.style.setProperty('--hm-color', single?.color ?? '#2f9e44');
  els.hint.textContent = single
    ? 'Кликните по клетке, чтобы отметить или снять отметку за прошлый день.'
    : 'Выберите привычку в списке, чтобы редактировать её историю на карте.';

  renderStats(single);
  renderGoal(single);
  renderMonthly(single);
  renderWeekdays(single);
  renderWeekly(single);
}

// Подбираем число недель и размер клетки под ширину панели: на широком экране — год
// с крупными клетками, на узком — меньше недель, чтобы карта помещалась без прокрутки.
const GAP = 3;
function mapWidth() {
  return (els.heatmap.clientWidth || 800) - 30; // минус колонка с днями недели
}

function weeksToShow() {
  const weeks = Math.max(12, Math.min(53, Math.floor(mapWidth() / (10 + GAP))));
  sizeCells(weeks, 10);
  return weeks;
}

/**
 * Размер клетки под число колонок. Для календарного года колонок всегда 53–54:
 * на узком экране клетки не уменьшаются ниже минимума, а карта прокручивается внутри панели.
 */
function sizeCells(columns, min) {
  const cell = Math.max(min, Math.min(18, Math.floor(mapWidth() / columns) - GAP));
  els.heatmap.style.setProperty('--cell', `${cell}px`);
}

function statKeys(single) {
  if (single) return state.checks[single.id] ?? [];
  // Для «всех» — день засчитывается, если выполнены ВСЕ привычки.
  const counts = countsByDay(state);
  return Object.keys(counts).filter((k) => counts[k] === state.habits.length && state.habits.length > 0);
}

function renderStats(single) {
  const keys = statKeys(single);
  const s = summarize(keys, TODAY, single?.createdAt ?? earliestCreated());
  const totalChecks = single
    ? s.total
    : Object.values(state.checks).reduce((sum, arr) => sum + arr.length, 0);
  const items = [
    ['Текущая серия', `${s.current} дн.`],
    ['Рекорд', `${s.longest} дн.`],
    ['За 30 дней', `${Math.round(s.rate30 * 100)}%`],
    ['Всего отметок', String(totalChecks)],
  ];
  fillStats(els.stats, items);
  if (!single) {
    const note = document.createElement('p');
    note.className = 'muted stat-note';
    note.textContent = 'Серии для «всех привычек» считаются по дням, когда выполнено всё.';
    els.stats.append(note);
  }
}

// ---------- Цель на неделю ----------

function renderGoal(single) {
  els.goalPanel.hidden = !single;
  if (!single) return;
  const keys = state.checks[single.id] ?? [];
  const { goal } = single;
  const week = weekProgress(keys, TODAY, goal);
  els.goalPanel.style.setProperty('--hm-color', single.color);
  els.goalSelect.value = String(goal);

  // Кружки: закрашено столько, сколько уже выполнено на этой неделе.
  els.goalProgress.innerHTML = '';
  const dots = document.createElement('div');
  dots.className = 'goal-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < goal; i += 1) {
    const dot = document.createElement('i');
    dot.className = `goal-dot${i < week.done ? ' done' : ''}`;
    dots.append(dot);
  }
  const text = document.createElement('p');
  text.className = 'goal-text';
  if (week.met) {
    text.classList.add('met');
    text.textContent = `Цель недели выполнена: ${week.done} из ${goal} ✓`;
  } else if (!week.reachable) {
    text.classList.add('late');
    text.textContent = `${week.done} из ${goal}. На этой неделе уже не успеть: осталось ${week.daysLeft} ${plural(week.daysLeft, DAYS)}, а нужно ещё ${week.remaining} ${plural(week.remaining, TIMES)}.`;
  } else {
    text.textContent = `${week.done} из ${goal}. Осталось ${week.remaining} ${plural(week.remaining, TIMES)} за ${week.daysLeft} ${plural(week.daysLeft, DAYS)} (включая сегодня).`;
  }
  els.goalProgress.append(dots, text);

  const streak = goalStreak(keys, TODAY, goal, single.createdAt);
  const best = longestGoalStreak(keys, TODAY, goal, single.createdAt);
  const success = goalSuccess(keys, TODAY, goal, single.createdAt);
  fillStats(els.goalStats, [
    ['Серия недель с целью', `${streak} нед.`],
    ['Рекорд недель', `${best} нед.`],
    ['Недель с целью', success.total ? percent(success.rate) : '—'],
    ['Выполнено недель', `${success.met} из ${success.total}`],
  ]);
}

function fillStats(container, items) {
  container.innerHTML = '';
  for (const [label, value] of items) {
    const div = document.createElement('div');
    div.className = 'stat';
    div.innerHTML = '<span class="stat-value"></span><span class="stat-label"></span>';
    div.querySelector('.stat-value').textContent = value;
    div.querySelector('.stat-label').textContent = label;
    container.append(div);
  }
}

// ---------- Графики по месяцам и дням недели ----------

/** Привычки, по которым считаются графики: выбранная или все. */
function chartHabits(single) {
  return single ? [single] : state.habits;
}

/** Складывает count/possible по нескольким привычкам: общий процент = Σвыполнено / Σвозможно. */
function mergeBuckets(lists) {
  if (!lists.length) return [];
  return lists[0].map((_, i) => {
    const count = lists.reduce((sum, l) => sum + l[i].count, 0);
    const possible = lists.reduce((sum, l) => sum + l[i].possible, 0);
    return { ...lists[0][i], count, possible, rate: possible ? Math.min(1, count / possible) : null };
  });
}

function renderMonthly(single) {
  const y = chartYear();
  const habits = chartHabits(single);
  const months = mergeBuckets(habits.map((h) => monthlyStats(state.checks[h.id] ?? [], y, TODAY, h.createdAt)));
  const { best, worst } = bestWorstMonth(months);
  els.monthlyTitle.textContent = `По месяцам · ${y}`;
  const bars = (months.length ? months : MONTHS.map((_, month) => ({ month, rate: null }))).map((m) => ({
    label: MONTHS_SHORT[m.month],
    value: m.rate === null ? null : Math.round(m.rate * 100),
    text: m.rate === null ? '' : percent(m.rate),
    highlight: best && m.month === best.month,
    title: m.rate === null
      ? `${MONTHS[m.month]} ${y}: нет данных`
      : `${MONTHS[m.month]} ${y}: ${m.count} из ${m.possible} (${percent(m.rate)})`,
  }));
  els.monthly.innerHTML = barChartSVG(bars, {
    max: 100, barWidth: 26, gap: 6, color: single?.color ?? '#2f9e44', label: `Выполнение по месяцам за ${y} год`,
  });
  els.monthlyNote.textContent = best
    ? `Лучший месяц: ${MONTHS[best.month]} (${percent(best.rate)}), худший: ${MONTHS[worst.month]} (${percent(worst.rate)}).`
    : 'За этот год пока нет данных.';
}

function renderWeekdays(single) {
  const habits = chartHabits(single);
  let from;
  let to;
  if (year === RECENT) {
    from = addDays(TODAY, -364);
    to = TODAY;
    els.weekdayTitle.textContent = 'По дням недели · 12 мес.';
  } else {
    from = `${year}-01-01`;
    to = `${year}-12-31` < TODAY ? `${year}-12-31` : TODAY;
    els.weekdayTitle.textContent = `По дням недели · ${year}`;
  }
  const lists = habits.map((h) => {
    const start = h.createdAt && h.createdAt > from ? h.createdAt : from;
    return weekdayStats(state.checks[h.id] ?? [], start, to);
  });
  const days = mergeBuckets(lists);
  const valid = days.filter((d) => d.rate !== null);
  const best = valid.length ? valid.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;
  const worst = valid.length ? valid.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
  const bars = (days.length ? days : WEEKDAYS.map((_, weekday) => ({ weekday, rate: null }))).map((d) => ({
    label: WEEKDAYS[d.weekday],
    value: d.rate === null ? null : Math.round(d.rate * 100),
    text: d.rate === null ? '' : percent(d.rate),
    highlight: best && d.weekday === best.weekday,
    title: d.rate === null
      ? `${WEEKDAYS_FULL[d.weekday]}: нет данных`
      : `${WEEKDAYS_FULL[d.weekday]}: ${d.count} из ${d.possible} (${percent(d.rate)})`,
  }));
  els.weekdays.innerHTML = barChartSVG(bars, {
    max: 100, barWidth: 26, gap: 8, color: single?.color ?? '#2f9e44', label: 'Выполнение по дням недели',
  });
  els.weekdayNote.textContent = best && best.weekday !== worst.weekday
    ? `Чаще всего: ${WEEKDAYS_FULL[best.weekday]} (${percent(best.rate)}), реже всего: ${WEEKDAYS_FULL[worst.weekday]} (${percent(worst.rate)}).`
    : '';
}

function earliestCreated() {
  return state.habits.map((h) => h.createdAt).sort()[0] ?? null;
}

function renderWeekly(single) {
  const keys = single
    ? state.checks[single.id] ?? []
    : Object.values(state.checks).flat();
  // для «всех» считаем сумму отметок за неделю (не уникальные дни)
  const weeks = single ? weeklyCounts(keys, TODAY, 12) : weeklyAll(12);
  const max = single ? 7 : Math.max(7 * state.habits.length, 1);
  els.weekly.innerHTML = '';
  for (const { start, count } of weeks) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.title = `Неделя с ${formatKey(start)}: ${count}`;
    bar.style.setProperty('--h', `${Math.round((count / max) * 100)}%`);
    bar.style.setProperty('--bar-color', single?.color ?? '#2f9e44');
    bar.innerHTML = `<span class="bar-fill"></span><span class="bar-label">${count}</span>`;
    els.weekly.append(bar);
  }
}

function weeklyAll(n) {
  return state.habits.length
    ? state.habits
        .map((h) => weeklyCounts(state.checks[h.id] ?? [], TODAY, n))
        .reduce((acc, arr) => acc.map((w, i) => ({ start: w.start, count: w.count + arr[i].count })))
    : weeklyCounts([], TODAY, n);
}

// ---------- Действия ----------

function onToggle(id, key) {
  commit(toggleCheck(state, id, key));
}

function showFormError(message) {
  els.formError.textContent = message;
  els.formError.hidden = !message;
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    const { state: next, habit } = addHabit(state, {
      name: els.name.value, color: els.color.value, goal: els.goal.value,
    });
    showFormError('');
    els.name.value = '';
    els.goal.value = '7';
    els.color.value = PALETTE[next.habits.length % PALETTE.length];
    commit(next, `Добавлено: ${habit.name}`);
  } catch (err) {
    showFormError(err.message);
  }
});

els.list.addEventListener('click', (e) => {
  const li = e.target.closest('.habit');
  if (!li) return;
  const id = li.dataset.id;
  const habit = state.habits.find((h) => h.id === id);
  if (e.target.closest('.habit-name')) {
    setView(view === id ? ALL : id);
  } else if (e.target.closest('.up')) {
    commit(moveHabit(state, id, -1));
  } else if (e.target.closest('.down')) {
    commit(moveHabit(state, id, 1));
  } else if (e.target.closest('.rename')) {
    startRename(li, habit);
  } else if (e.target.closest('.delete')) {
    // Вместо confirm() — удаление с возможностью отмены: так быстрее и не блокирует страницу.
    commitWithUndo(deleteHabit(state, id), `Удалено: ${habit.name}`);
  }
});

/** Переименование прямо в строке списка: Enter — сохранить, Esc — отменить. */
function startRename(li, habit) {
  const button = li.querySelector('.habit-name');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = habit.name;
  input.maxLength = 60;
  input.setAttribute('aria-label', 'Новое название');
  button.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save && input.value.trim() !== habit.name) {
      try {
        commit(updateHabit(state, habit.id, { name: input.value }), 'Переименовано');
        return;
      } catch (err) {
        toast(err.message, true);
      }
    }
    render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

/** Применяет изменение и показывает тост с кнопкой «Отменить». */
function commitWithUndo(next, message) {
  const previous = state;
  commit(next);
  toast(message, false, {
    label: 'Отменить',
    run: () => commit(previous, 'Действие отменено'),
  });
}

els.list.addEventListener('change', (e) => {
  if (!e.target.classList.contains('today-check')) return;
  const id = e.target.closest('.habit').dataset.id;
  commit(toggleCheck(state, id, TODAY));
});

els.select.addEventListener('change', () => setView(els.select.value));

els.year.addEventListener('change', () => {
  year = els.year.value === RECENT ? RECENT : Number(els.year.value);
  writePref(YEAR_KEY, String(year));
  renderMap();
});

els.goalSelect.addEventListener('change', () => {
  const single = state.habits.find((h) => h.id === view);
  if (!single) return;
  const goal = Number(els.goalSelect.value);
  commit(updateHabit(state, single.id, { goal }), `${single.name}: цель — ${goalLabel(goal)}`);
});

function setView(next) {
  view = next;
  writePref(VIEW_KEY, view);
  render();
}

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([exportJSON(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `habits-${TODAY}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Файл экспорта сохранён');
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const next = importJSON(await file.text());
    commitWithUndo(next, `Импортировано привычек: ${next.habits.length}`);
  } catch (err) {
    toast(`Ошибка импорта: ${err.message}`, true);
  }
});

// Демо-данные из пустого состояния
els.empty.addEventListener('click', (e) => {
  if (e.target.closest('#demo-btn')) commit(demoState(TODAY), 'Загружены демо-данные');
});
els.empty.innerHTML += ' <button type="button" id="demo-btn" class="link">Загрузить демо-данные</button>';

// ---------- Тема ----------

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme-btn').textContent = theme === 'dark' ? '☀ Светлая' : '☾ Тёмная';
}
const preferredDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
applyTheme(readPref(THEME_KEY) ?? (preferredDark ? 'dark' : 'light'));
$('#theme-btn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  writePref(THEME_KEY, next);
  applyTheme(next);
});

// ---------- Горячие клавиши: 1..9 — отметить привычку за сегодня ----------

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 9 && state.habits[n - 1]) {
    const habit = state.habits[n - 1];
    const was = isChecked(state, habit.id, TODAY);
    commit(toggleCheck(state, habit.id, TODAY), `${habit.name}: ${was ? 'отметка снята' : 'выполнено'}`);
  }
});

// ---------- Тост ----------

let toastTimer;
function toast(message, isError = false, action = null) {
  els.toast.textContent = message;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      els.toast.classList.remove('show');
      action.run();
    }, { once: true });
    els.toast.append(btn);
  }
  els.toast.classList.toggle('error', isError);
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), action ? 6000 : 2500);
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderMap, 150);
});

render();
// Экспортируем для отладки в консоли.
window.habitHeatmap = { get state() { return state; }, today: TODAY, addDays };
