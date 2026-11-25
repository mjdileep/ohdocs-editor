// Only opaque, literal colors and bounded point sizes enter note styles.
// This module is shared by the editor, clipboard parser and public renderer.
export function textColor(value) {
  if (typeof value !== 'string') return null;
  const color = value.trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(color)) return color;
  if (/^#[\da-f]{3}$/.test(color)) return '#' + [...color.slice(1)].map(c => c + c).join('');
  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(1(?:\.0+)?))?\s*\)$/);
  if (rgb && rgb.slice(1, 4).every(v => Number(v) <= 255)) return '#' + rgb.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('');
  return null;
}

export function textSize(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(pt|px)?$/i);
  if (!match) return null;
  const points = Number(match[1]) * (match[2]?.toLowerCase() === 'px' ? .75 : 1);
  return points >= 6 && points <= 96 ? `${Math.round(points * 100) / 100}pt` : null;
}

export function textStyleAttributes(attrs = {}) {
  const color = textColor(attrs.color), fontSize = textSize(attrs.fontSize);
  return { ...(color ? { color } : {}), ...(fontSize ? { fontSize } : {}) };
}
