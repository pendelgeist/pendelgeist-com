/**
 * The DOM-building blocks the two data-analysis pages share: a sortable table,
 * a stat-tile grid, and a single-series bar chart. /nasubi and /vqar-stats
 * render the same three components from different data, so they live here
 * rather than in two copies that drift apart (they already had).
 *
 * Only the JS is shared. Each page keeps its own `.data-table` / `.stat-tile` /
 * `.bar-chart` rules in its own stylesheet, the way every other page-specific
 * style in this repo does - a page added later can restyle these without
 * touching the other's look.
 *
 * Everything here builds DOM nodes rather than assigning innerHTML, so a stray
 * '<' in a transcribed cell is text, never markup.
 */

/** Parses "84,000" / "13.3%" / "991,164" into a comparable number, or NaN. */
export function parseNumeric(cell) {
  const cleaned = String(cell).replace(/,/g, '').replace(/%$/, '');
  return Number(cleaned);
}

/**
 * A grid of "big number over a label" tiles.
 * @param {HTMLElement} container
 * @param {{label: string, value: string}[]} stats
 */
export function renderStatGrid(container, stats) {
  container.replaceChildren(...stats.map(({ label, value }) => {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';
    const val = document.createElement('div');
    val.className = 'stat-value';
    val.textContent = value;
    const lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = label;
    tile.append(val, lbl);
    return tile;
  }));
}

/**
 * Builds a sortable table, wrapped in its own horizontal scroll container.
 * Returns the wrapper rather than appending it, so a caller can either replace
 * a container's contents or add the table alongside other blocks.
 *
 * Each header is a real <button> inside its <th>, not a clickable <th>: that's
 * what makes the sort reachable by keyboard (a bare th with tabindex focuses
 * but can't be activated) and what lets `aria-sort` on the th announce the
 * current order. The .sorted-asc/.sorted-desc classes drive the arrow glyph in
 * each page's own CSS.
 *
 * Sorting is numeric only when *every* value in the column parses as a number,
 * so a column of mixed text and digits still sorts predictably as text.
 *
 * @param {string[]} columns - header labels
 * @param {string[][]} rows - one array of cell strings per row, in column order
 * @returns {HTMLElement} the `.table-scroll` wrapper holding the table
 */
export function createDataTable(columns, rows) {
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  let sortState = { col: -1, dir: 1 };

  columns.forEach((col, i) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.setAttribute('aria-sort', 'none');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sort-button';
    button.textContent = col;
    button.addEventListener('click', () => {
      sortState = { col: i, dir: sortState.col === i ? -sortState.dir : 1 };
      applySort();
    });

    th.appendChild(button);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  function renderRows(data) {
    tbody.replaceChildren(...data.map(row => {
      const tr = document.createElement('tr');
      tr.append(...row.map(cell => {
        const td = document.createElement('td');
        td.textContent = cell;
        return td;
      }));
      return tr;
    }));
  }

  function applySort() {
    const sorted = [...rows];
    if (sortState.col >= 0) {
      const { col, dir } = sortState;
      const allNumeric = rows.every(r => !Number.isNaN(parseNumeric(r[col])));
      sorted.sort((a, b) => {
        if (allNumeric) return (parseNumeric(a[col]) - parseNumeric(b[col])) * dir;
        return a[col].localeCompare(b[col]) * dir;
      });
    }
    renderRows(sorted);
    [...headRow.children].forEach((th, i) => {
      const ascending = sortState.col === i && sortState.dir === 1;
      const descending = sortState.col === i && sortState.dir === -1;
      th.classList.toggle('sorted-asc', ascending);
      th.classList.toggle('sorted-desc', descending);
      th.setAttribute('aria-sort', ascending ? 'ascending' : descending ? 'descending' : 'none');
    });
  }

  renderRows(rows);

  const wrap = document.createElement('div');
  wrap.className = 'table-scroll';
  wrap.appendChild(table);
  return wrap;
}

/**
 * A single-series magnitude bar chart (one hue, direct-labeled). The exact
 * values are always readable as text on each bar and in the table these
 * accompany, so the chart itself is one `role="img"` rather than a tree of
 * nodes a screen reader has to walk.
 *
 * @param {{label: string, value: number, display: string}[]} items
 * @param {{ariaLabel?: string}} [options]
 * @returns {HTMLElement|null} null when there's nothing to plot
 */
export function createBarChart(items, { ariaLabel } = {}) {
  if (!items.length) return null;
  const max = Math.max(...items.map(i => i.value), 1);

  const chart = document.createElement('div');
  chart.className = 'bar-chart';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', ariaLabel ?? 'Bar chart; see the values labeled on each bar.');

  for (const item of items) {
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.title = `${item.label}: ${item.display}`;

    const value = document.createElement('div');
    value.className = 'bar-value';
    value.textContent = item.display;

    const bar = document.createElement('div');
    bar.className = 'bar-fill';
    bar.style.height = `${Math.max((item.value / max) * 100, 2)}%`;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = item.label;

    col.append(value, bar, label);
    chart.appendChild(col);
  }

  return chart;
}

/**
 * createBarChart, rendered straight into a container of its own - which is
 * every case where the chart is the whole of what that element holds.
 * @param {HTMLElement} container
 * @param {{label: string, value: number, display: string}[]} items
 * @param {{ariaLabel?: string}} [options]
 */
export function renderBarChart(container, items, options) {
  const chart = createBarChart(items, options);
  container.replaceChildren(...(chart ? [chart] : []));
}
