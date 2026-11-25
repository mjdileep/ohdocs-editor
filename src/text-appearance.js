import { icon } from './icons.js';
import { applyTextFormatting, selectedTextFormatting } from './text-formatting.js';
import { applyCellBackground, selectedCellBackground } from './table-appearance.js';
import { textColor, textSize } from '../format/text-formatting.mjs';

export const appearanceActions = [
  ['text-color', 'Text color', 'baseline'],
  ['background-color', 'Background color', 'highlighter'],
  ['font-size', 'Font size', 'type'],
];
export const tableAppearanceActions = [
  ['cell-background', 'Cell background', 'paint-bucket'],
  ['row-background', 'Row background', 'rows-3'],
  ['column-background', 'Column background', 'columns-3'],
  ['table-background', 'Table background', 'table-2'],
];
let nextField = 0;
const colors = [
  ['Black', '#171b1f'], ['Gray', '#64748b'], ['White', '#ffffff'], ['Red', '#b91c1c'],
  ['Orange', '#c2410c'], ['Gold', '#a16207'], ['Green', '#15803d'], ['Teal', '#0f766e'],
  ['Blue', '#1d4ed8'], ['Purple', '#7e22ce'], ['Pink', '#be185d'], ['Yellow', '#ffe680'],
  ['Peach', '#fed7aa'], ['Mint', '#bbf7d0'], ['Sky', '#bfdbfe'], ['Lavender', '#e9d5ff'],
];
const attributes = { 'text-color': 'color', 'background-color': 'backgroundColor', 'font-size': 'fontSize' };

export function createTextAppearance({ menu, getEditor, finish }) {
  let target, attribute, scope;
  const fieldId = `fn-format-value-${++nextField}`;
  function show(kind) {
    const editor = getEditor();
    target = { editor, doc: editor.state.doc, selection: editor.state.selection };
    scope = tableAppearanceActions.some(([action]) => action === kind) ? kind.split('-')[0] : null;
    attribute = attributes[kind];
    const value = scope ? selectedCellBackground(editor.state, scope) : selectedTextFormatting(editor.state)[attribute], size = attribute === 'fontSize';
    const title = [...appearanceActions, ...tableAppearanceActions].find(([action]) => action === kind)[1];
    const reset = size ? 'Automatic size' : attribute === 'color' ? 'Automatic text color' : 'No background';
    const button = (value, label, content = label, extra = '') => `<button type="button" data-format-value="${value}" aria-label="${label}" title="${label}" ${extra}>${content}</button>`;
    const current = size ? textSize(value) : textColor(value);
    const choices = size
      ? [8, 10, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map(n => button(n + 'pt', n + ' pt', n, `aria-pressed="${current === n + 'pt'}"`)).join('')
      : colors.map(([label, color]) => button(color, label, `<span style="background-color:${color}"></span>${current === color ? icon('check') : ''}`, `aria-pressed="${current === color}"`)).join('');
    return `<div class="fn-appearance" role="group" aria-label="${title}">${value === 'mixed' ? '<small class="muted">Mixed</small>' : ''}
      ${scope ? `<div class="fn-fill-scope" role="group" aria-label="Apply background to">${[['cell','Cells'],['row','Rows'],['column','Columns'],['table','Table']].map(([key,label]) => `<button type="button" data-fill-scope="${key}" aria-pressed="${scope === key}">${label}</button>`).join('')}</div>` : ''}
      ${button('', reset, icon(size ? 'type' : 'remove-formatting') + `<span>${size || attribute === 'color' ? 'Automatic' : 'None'}</span>`, `aria-pressed="${value === null}"`)}
      <div class="${size ? 'fn-size-grid' : 'fn-color-grid'}" role="group" aria-label="${title} presets">${choices}</div>
      <form class="fn-appearance-custom">
        <div>${size ? '' : `<input type="color" aria-label="Choose custom color" value="${current || (attribute === 'color' ? '#171b1f' : '#ffe680')}">`}
        <input id="${fieldId}" data-format-input aria-label="${size ? 'Custom font size in points' : 'Custom color hex'}" ${size ? `type="number" min="6" max="96" step="any" inputmode="decimal" value="${current ? parseFloat(current) : ''}" placeholder="Size (pt)" title="6–96 pt"` : `type="text" value="${current || ''}" placeholder="#RRGGBB" pattern="#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?" maxlength="7" spellcheck="false"`} required>${size ? '<span class="fn-size-unit">pt</span>' : ''}
        <button type="submit" aria-label="Apply" title="Apply">${icon('check')}</button></div>
      </form></div>`;
  }
  function apply(value) {
    const editor = getEditor();
    // Focus may be in a color/size field; keep the original editor selection.
    // If the note changed while a system color picker was open, do nothing.
    if (editor !== target?.editor || editor.isDestroyed || editor.state.doc !== target.doc || !editor.state.selection.eq(target.selection)) { finish(); return; }
    const field = attribute, area = scope;
    finish();
    if (area) applyCellBackground(editor, area, value);
    else applyTextFormatting(editor, field, value);
  }
  menu.addEventListener('click', event => {
    const region = event.target.closest('[data-fill-scope]');
    if (region) {
      event.preventDefault(); event.stopPropagation();
      menu.innerHTML = show(region.dataset.fillScope + '-background');
      menu.querySelector(`[data-fill-scope="${scope}"]`).focus({ preventScroll: true });
      return;
    }
    const choice = event.target.closest('[data-format-value]');
    if (!choice) return;
    event.preventDefault(); event.stopPropagation();
    apply(choice.dataset.formatValue || null);
  });
  menu.addEventListener('input', event => {
    if (event.target.matches('.fn-appearance input[type="color"]')) menu.querySelector('[data-format-input]').value = event.target.value;
  });
  menu.addEventListener('keydown', event => {
    const grid = event.target.closest('.fn-color-grid,.fn-size-grid');
    const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 4;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    if (!grid || !delta) return;
    event.preventDefault();
    const buttons = [...grid.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  });
  menu.addEventListener('submit', event => {
    if (!event.target.matches('.fn-appearance-custom')) return;
    event.preventDefault();
    const input = event.target.querySelector('[data-format-input]');
    if (input.reportValidity()) apply(attribute === 'fontSize' ? textSize(input.value) : textColor(input.value));
  });
  return { show };
}
