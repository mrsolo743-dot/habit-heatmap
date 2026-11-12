import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barChartSVG, escapeXML } from '../../js/charts.js';
import { plural, goalLabel, percent, TIMES, DAYS } from '../../js/format.js';

test('barChartSVG рисует по столбику на значение и масштабирует по max', () => {
  const svg = barChartSVG([{ label: 'a', value: 50 }, { label: 'b', value: 100 }], { max: 100, height: 120 });
  assert.equal((svg.match(/class="ch-fill"/g) ?? []).length, 2);
  const heights = [...svg.matchAll(/class="ch-fill" x="\d+" y="[\d.]+" width="\d+" height="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(heights, [43, 86]); // область графика 120 − 16 − 18 = 86
  assert.match(svg, /^<svg[^>]+role="img"/);
});

test('barChartSVG: null — заглушка без столбика, подсветка и подсказки', () => {
  const svg = barChartSVG([
    { label: 'x', value: null, title: 'нет данных' },
    { label: 'y', value: 3, highlight: true, text: '3 раза' },
  ]);
  assert.equal((svg.match(/ch-none/g) ?? []).length, 1);
  assert.match(svg, /class="ch-bar hl"/);
  assert.match(svg, /<title>нет данных<\/title>/);
  assert.match(svg, />3 раза</);
});

test('barChartSVG экранирует подписи', () => {
  const svg = barChartSVG([{ label: '<b>', value: 1, title: '"x" & y' }], { label: '<script>' });
  assert.ok(!svg.includes('<b>'));
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /&lt;b&gt;/);
  assert.match(svg, /&quot;x&quot; &amp; y/);
  assert.equal(escapeXML("'"), '&#39;');
});

test('plural склоняет по правилам русского языка', () => {
  const cases = { 1: 'раз', 2: 'раза', 4: 'раза', 5: 'раз', 11: 'раз', 12: 'раз', 14: 'раз', 21: 'раз', 22: 'раза', 111: 'раз' };
  for (const [n, word] of Object.entries(cases)) assert.equal(plural(Number(n), TIMES), word, `n=${n}`);
  assert.equal(plural(1, DAYS), 'день');
  assert.equal(plural(3, DAYS), 'дня');
  assert.equal(plural(0, DAYS), 'дней');
});

test('goalLabel и percent', () => {
  assert.equal(goalLabel(7), 'каждый день');
  assert.equal(goalLabel(1), '1 раз в неделю');
  assert.equal(goalLabel(3), '3 раза в неделю');
  assert.equal(goalLabel(5), '5 раз в неделю');
  assert.equal(percent(0.734), '73%');
  assert.equal(percent(1), '100%');
});
