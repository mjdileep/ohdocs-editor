// Renders a saved document as static, read-only HTML for public pages,
// previews and exports. Every value is escaped or passed through the same
// validators the editor uses, so nothing in a document can inject markup.
//
// context.images: Map of attachment id -> { url, width, height } for images the
// app can serve. Attachments without an entry fall back to their source URL.
import katex from 'katex';
import { mediaAngle, rotationStyles } from './media-geometry.mjs';
import { drawingData, drawingSVG } from './drawing.mjs';
import { imageFormat, formattedImage } from './image-format.mjs';
import { codeLanguage, codeLanguageLabel, createCodeHighlighter } from './code-highlighting.mjs';
import { renderMath, footnoteID, footnoteLabel, markdownURL, escapeHTML as esc } from './markdown.mjs';
import { textColor, textStyleAttributes } from './text-formatting.mjs';
import { videoSource } from './video.mjs';
// A cell's stored column widths as one whole number of pixels, or 0 when unset or implausible.
function cellWidth(node) {
  const widths = node?.attrs?.colwidth;
  if (!Array.isArray(widths) || !widths.length || !widths.every(value => Number.isInteger(value) && value > 0 && value <= 4000)) return 0;
  return widths.reduce((sum, value) => sum + value, 0);
}
const number = (value, max, min = 0) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : Math.max(0, min);
function placement(node, styleClass, classes) {
  const a = { ...(node.type === 'codeBlock' ? { documentFlow: true } : {}), ...node.attrs }, layout = ['canvas', 'left', 'right', 'free'].includes(a.layout) ? a.layout : '';
  const width = number(a.width || a.canvasWidth, 10000), offset = number(a.offset, 100), gap = number(a.gap, 100000, -12);
  const ratio = number(a.frameRatio, 10000), minHeight = number(a.minHeight, 10000);
  const angle = ratio && node.type === 'previewAttachment' ? mediaAngle(a.mediaRotation) : 0;
  const rotated = Object.entries(rotationStyles(ratio,angle)).map(([key,value]) => key+':'+value);
  const css = [...rotated, ratio && `--fn-frame-ratio:${ratio}`, minHeight && `--fn-min-height:${minHeight}px`, width && `width:${width}px`, layout && `--offset:${offset}%`, gap && `--gap:${gap}px`].filter(Boolean).join(';');
  return `${styleClass(css, classes)} data-object="${node.type}"${angle ? ` data-media-rotation="${angle}"` : ''}${ratio ? ` data-frame-ratio="${ratio}"` : ''}${layout ? ` data-layout="${layout}"` : ''} data-offset="${offset}" data-gap="${gap}" data-canvas-width="${number(a.canvasWidth, 10000)}" data-width="${width}" data-layer="${number(a.layer, 1000000)}"${a.clear === true ? ' data-clear' : ''}${a.documentFlow === true ? ' data-document-flow' : ''}`;
}
function codeHTML(tree) {
  if (tree.type === 'text') return esc(tree.value);
  const children = (tree.children || []).map(codeHTML).join('');
  return tree.type === 'element' ? `<span class="${esc((tree.properties?.className || []).join(' '))}">${children}</span>` : children;
}
const copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
export function renderDoc(node, styles = new Map(), context = {}) {
  const styleClass = (css, classes = '') => {
    if (css && !styles.has(css)) styles.set(css, `fn-text-${styles.size}`);
    const value = [classes, css && styles.get(css)].filter(Boolean).join(' ');
    return value ? ` class="${value}"` : '';
  };
  const styled = (tag, css, text) => css ? `<${tag}${styleClass(css)}>${text}</${tag}>` : text;
  if (node.type === 'text') {
    let text = esc(node.text);
    for (const mark of node.marks || []) {
      const tags = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', superscript: 'sup', subscript: 'sub' };
      if (tags[mark.type]) text = `<${tags[mark.type]}>${text}</${tags[mark.type]}>`;
      if (mark.type === 'textStyle') {
        const { color, fontSize } = textStyleAttributes(mark.attrs || {});
        text = styled('span', [color && `color:${color}`, fontSize && `font-size:${fontSize}`].filter(Boolean).join(';'), text);
      }
      if (mark.type === 'highlight') {
        const color = textColor(mark.attrs?.color);
        text = color ? styled('mark', `background-color:${color};color:inherit`, text) : `<mark>${text}</mark>`;
      }
      if (mark.type === 'link') { const href = markdownURL(mark.attrs?.href); if (href) text = `<a href="${esc(href)}" rel="noreferrer noopener">${text}</a>`; }
    }
    return text;
  }
  if (node.type === 'inlineMath' || node.type === 'blockMath') { const block = node.type === 'blockMath', tag = block ? 'div' : 'span'; return `<${tag} class="fn-math" data-type="${block ? 'block-math' : 'inline-math'}">${renderMath(katex, node.attrs?.latex, block)}</${tag}>`; }
  if (node.type === 'footnoteReference') return `<sup><a href="#${footnoteID(node.attrs?.label)}">[${esc(footnoteLabel(node.attrs?.label))}]</a></sup>`;
  if (node.type === 'noteReference') return '';
  if (node.type === 'previewAttachment') {
    const ink=drawingData(node.attrs?.drawing);
    if(ink)return `<div${placement(node,styleClass,'fn-attachment fn-image fn-drawing')} data-ink="${esc(node.attrs?.label || 'Drawing')}" data-ink-page="${number(node.attrs?.drawingPageWidth,10000)}">${drawingSVG(ink)}</div>`;
    const video=videoSource(node.attrs?.videoSource);
    if(video)return `<div${placement(node, styleClass, 'fn-attachment fn-image fn-video')} data-video-source="${esc(video.url)}"><noscript><a href="${esc(video.url)}" rel="noreferrer noopener">Watch video</a></noscript></div>`;
    const file = context.images?.get(node.attrs?.fileId), source = markdownURL(node.attrs?.source, true);
    if (!file && !source) return '';
    const label = esc(node.attrs?.label || 'Image');
    const format = imageFormat(node.attrs?.imageFormat);
    if (file && format) return `<div${placement(node, styleClass, 'fn-attachment fn-image')}>${formattedImage(file.url, format, node.attrs?.label || 'Image')}</div>`;
    const picture = file
      ? `<img src="${esc(file.url)}" alt="${label}" decoding="async"${file.width && file.height ? ` width="${file.width}" height="${file.height}"` : ''}>`
      : `<img alt="${label}" hidden><button type="button" class="fn-load-image" data-source="${esc(source)}">Load ${label} from ${esc(new URL(source).hostname)}</button>`;
    return `<div${placement(node, styleClass, 'fn-attachment fn-image')}${format ? ` data-image-format="${esc(JSON.stringify(format))}"` : ''}>${picture}</div>`;
  }
  if (node.type === 'codeBlock') {
    const text = (node.content || []).map(child => child.text || '').join('');
    const highlighter = context.highlighter ||= createCodeHighlighter(), language = codeLanguage(node.attrs?.language);
    const detected = language === 'auto' ? highlighter.detect(text) : language;
    const label = language === 'auto' ? (detected === 'plaintext' ? 'Auto' : 'Auto · ' + codeLanguageLabel(detected)) : codeLanguageLabel(language);
    return `<div${placement(node, styleClass, 'fn-code-block')}><div class="fn-code-tools"><span class="fn-code-language-control is-readonly">${esc(label)}</span><span class="fn-code-status" role="status"></span><button type="button" class="fn-code-copy" aria-label="Copy code" title="Copy code">${copyIcon}</button></div><pre><code class="language-${esc(detected)}">${codeHTML(highlighter.highlight(language, text))}</code></pre></div>`;
  }
  const tags = { paragraph: 'p', heading: 'h' + (Number.isInteger(node.attrs?.level) && node.attrs.level >= 1 && node.attrs.level <= 6 ? node.attrs.level : 2), bulletList: 'ul', orderedList: 'ol', listItem: 'li', taskList: 'ul', taskItem: 'li', blockquote: 'blockquote', codeBlock: 'pre', table: 'table', tableRow: 'tr', tableCell: 'td', tableHeader: 'th', details: 'details', detailsSummary: 'summary', detailsContent: 'div' };
  if (node.type === 'hardBreak') return '<br>';
  if (node.type === 'horizontalRule') return '<hr>';
  const children = (node.content || []).map(child => renderDoc(child, styles, context)).join(''), tag = tags[node.type];
  if (node.type === 'footnoteDefinition') return `<section class="fn-footnote" id="${footnoteID(node.attrs?.label)}" data-footnote-definition="${esc(footnoteLabel(node.attrs?.label))}">${children}</section>`;
  if (node.type === 'taskList') return `<ul data-type="taskList">${children}</ul>`;
  if (node.type === 'taskItem') {
    const checked = node.attrs?.checked === true;
    return `<li data-checked="${checked}"><label><input type="checkbox" aria-label="Completed" disabled${checked ? ' checked' : ''}></label><div>${children}</div></li>`;
  }
  if (node.type === 'table') {
    const widths = (node.content?.[0]?.content || []).map(cellWidth), width = widths.length && widths.every(Boolean) ? widths.reduce((sum, value) => sum + value, 0) : 0;
    const columns = (node.content?.[0]?.content || []).flatMap(cell => Array.from({ length: number(cell.attrs?.colspan || 1, 100, 1) }, (_, i) => {
      const width = cell.attrs?.colwidth?.[i];
      return Number.isInteger(width) && width > 0 && width <= 4000 ? width : 0;
    }));
    const colgroup = columns.length ? `<colgroup>${columns.map(w => `<col${w ? styleClass(`width:${w}px`) : ''}>`).join('')}</colgroup>` : '';
    return `<div${placement(node, styleClass, `fn-table${width ? ' is-sized' : ''}`)}><div class="tableWrapper"><table${width ? styleClass(`width:${width}px`) : ''}>${colgroup}<tbody>${children}</tbody></table></div></div>`;
  }
  if (node.type === 'tableCell' || node.type === 'tableHeader') {
    const spans = ['colspan', 'rowspan'].filter(name => Number.isInteger(node.attrs?.[name]) && node.attrs[name] > 1 && node.attrs[name] <= 100);
    const width = cellWidth(node);
    const color = textColor(node.attrs?.backgroundColor);
    return `<${tag}${styleClass([color && `background-color:${color}`, ['left','center','right'].includes(node.attrs?.align) && `text-align:${node.attrs.align}`].filter(Boolean).join(';'))}${spans.map(name => ` ${name}="${node.attrs[name]}"`).join('')}${width ? ` width="${width}"` : ''}>${children}</${tag}>`;
  }
  if (node.type === 'orderedList' && Number.isSafeInteger(node.attrs?.start)) return `<ol start="${node.attrs.start}">${children}</ol>`;
  if (node.type === 'details') return `<details class="fn-public-details"${node.attrs?.open === true ? ' open' : ''}>${children}</details>`;
  if (node.type === 'paragraph' && !children) return '<p><br></p>';
  return tag ? `<${tag}>${children}</${tag}>` : children;
}
