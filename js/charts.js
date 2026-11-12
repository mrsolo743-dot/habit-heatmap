// Простые столбчатые SVG-диаграммы без библиотек.
// barChartSVG — чистая функция (возвращает строку SVG), поэтому её можно тестировать в Node.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Экранирует текст для вставки в SVG/HTML. */
export function escapeXML(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/**
 * @typedef {{label: string, value: number|null, text?: string, title?: string, highlight?: boolean}} Bar
 * value — от 0 до max; null означает «нет данных» (рисуется пунктирная заглушка).
 * text — подпись над столбиком (по умолчанию само значение), title — всплывающая подсказка.
 */

/**
 * @param {Bar[]} bars
 * @param {{max?: number, height?: number, barWidth?: number, gap?: number, color?: string, label?: string}} options
 */
export function barChartSVG(bars, { max = null, height = 120, barWidth = 28, gap = 10, color = '#2f9e44', label = '' } = {}) {
  const top = 16; // место под подписи значений
  const bottom = 18; // место под подписи столбиков
  const plot = height - top - bottom;
  const values = bars.map((b) => b.value ?? 0);
  const scaleMax = max ?? Math.max(1, ...values);
  const width = bars.length * barWidth + Math.max(0, bars.length - 1) * gap;

  const parts = bars.map((bar, i) => {
    const x = i * (barWidth + gap);
    const cx = x + barWidth / 2;
    const title = bar.title ? `<title>${escapeXML(bar.title)}</title>` : '';
    const caption = `<text class="ch-label" x="${cx}" y="${height - 4}" text-anchor="middle">${escapeXML(bar.label)}</text>`;
    if (bar.value === null || bar.value === undefined) {
      return `<g class="ch-bar empty">${title}<rect class="ch-none" x="${x}" y="${top + plot - 2}" width="${barWidth}" height="2" rx="1"/>${caption}</g>`;
    }
    const ratio = Math.max(0, Math.min(1, bar.value / scaleMax));
    const h = Math.max(2, Math.round(ratio * plot));
    const y = top + plot - h;
    const text = bar.text ?? String(bar.value);
    return `<g class="ch-bar${bar.highlight ? ' hl' : ''}">${title}`
      + `<rect class="ch-track" x="${x}" y="${top}" width="${barWidth}" height="${plot}" rx="4"/>`
      + `<rect class="ch-fill" x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4"/>`
      + `<text class="ch-value" x="${cx}" y="${y - 4}" text-anchor="middle">${escapeXML(text)}</text>`
      + `${caption}</g>`;
  });

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" `
    + `role="img" aria-label="${escapeXML(label)}" style="--ch-color:${escapeXML(color)}">${parts.join('')}</svg>`;
}
