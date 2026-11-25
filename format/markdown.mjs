// Markdown links never execute code or carry credentials. Remote pictures are
// loaded only after a reader chooses to contact their host.
export function markdownURL(value, image = false) {
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020]/.test(value)) return null;
  if (!image && /^#[\w%.-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return (image ? url.protocol === 'https:' : ['https:', 'http:', 'mailto:'].includes(url.protocol)) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export const footnoteLabel = value => String(value || '').trim().replace(/[\s\[\]<>]/g, '-').slice(0, 100) || 'note';
export const footnoteID = value => 'fn-footnote-' + encodeURIComponent(footnoteLabel(value));
export const mathOptions = { output: 'mathml', throwOnError: true, trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 };
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
export function renderMath(katex, latex, displayMode = false) {
  const source = String(latex || '').slice(0, 10000);
  try { return katex.renderToString(source, { ...mathOptions, displayMode }); }
  catch { return `<code class="fn-math-error">${escapeHTML(source)}</code>`; }
}
