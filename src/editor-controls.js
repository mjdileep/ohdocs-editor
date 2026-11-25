import { startDrawing, stopDrawing, isDrawing } from './drawing.js';
import { insertShortcut, insertShortcutLabel, isMacPlatform } from './editor-shortcuts.js';
import { icon } from './icons.js';
import { markdownURL } from '../format/markdown.mjs';
import { getMarkRange } from '@tiptap/core';
import { followEditorLink, runEditorCommand, commandState, marks, styles, inserts } from './editor.js';
import { copyEditorSelection, pasteEditorSelection } from './editor-clipboard.js';
import { selectedTextFormatting } from './text-formatting.js';
import { appearanceActions, tableAppearanceActions, createTextAppearance } from './text-appearance.js';
import { objectFromTarget, objectToolbar } from './object-tools.js';
import { canvasStack, stackingChoices, restack, stackable } from './object-stacking.js';
import { duplicateObject, objectShortcutLabels } from './object-keys.js';

export function createEditorControls({ root, getEditor, onLink, onAttach, onNoteLink, onMarkdown, onVideo, isContextOpen, onOpen, bar = root.querySelector('#formatbar'), body = root.querySelector('#note-body'), menu = root.querySelector('#fn-format-menu') }) {
  const listeners = new AbortController();
  const { signal } = listeners;
  const bubble = document.createElement('div');
  bubble.className = 'fn-selection'; bubble.hidden = true;
  bubble.setAttribute('role', 'group'); bubble.setAttribute('aria-label', 'Selected text formatting');
  bubble.innerHTML = [...marks.slice(0,4), ...appearanceActions, ['link','Add or edit link','link']].map(([value,label,glyph]) => `<button type="button" class="fn-icon" ${marks.some(([mark]) => mark === value) ? `data-command="${value}"` : `data-action="${value}"`} aria-label="${label}" title="${label}">${icon(glyph)}</button>`).join('');
  root.append(bubble);
  let frame = 0, anchor, releaseMenu;
  const appearance = createTextAppearance({ menu, getEditor, finish: () => { close(); schedule(); } });
  // Keyboard shortcuts shown beside each option, in the platform's own notation.
  const mac = isMacPlatform();
  const keys = { bold:'B', italic:'I', underline:'U', strike:'⇧S', highlight:'⇧H', code:'E', paragraph:'⌥0', heading:'⌥2', subheading:'⌥3', bullets:'⇧8', numbered:'⇧7', checklist:'⇧9', quote:'⇧B', codeBlock:'⌥C', undo:'Z', redo:'⇧Z', link:'K' };
  const shortcut = command => insertShortcutLabel(command,mac) || (!keys[command] ? '' : mac ? '⌘' + keys[command] : 'Ctrl+' + keys[command].replace('⇧','Shift+').replace('⌥','Alt+'));
  const hint = command => shortcut(command) ? `<kbd>${shortcut(command)}</kbd>` : '';
  const items = values => values.map(([value,label,glyph]) => `<button type="button" data-command="${value}">${icon(glyph)}<span>${label}</span>${hint(value)}</button>`).join('');
  // Every option is a button when the page is wide enough. As it narrows, the
  // least-used ones (higher data-p) fold away first; they all remain in the two
  // menus, so nothing is ever clipped or scrolled out of reach.
  function build() {
    const tip = (label, command) => shortcut(command) ? `${label} (${shortcut(command)})` : label;
    const button = (value,label,glyph,p) => `<button type="button" class="fn-icon" data-command="${value}" data-p="${p}" aria-label="${label}" title="${tip(label,value)}">${icon(glyph)}</button>`;
    const act = (value,label,glyph,p) => `<button type="button" class="fn-icon" data-action="${value}" data-p="${p}" aria-label="${label}" title="${tip(label,value)}">${icon(glyph)}</button>`;
    const group = (...parts) => `<span class="fn-group">${parts.join('')}</span>`;
    bar.setAttribute('role','toolbar'); bar.setAttribute('aria-label','Note formatting');
    bar.innerHTML =
      group(`<button type="button" class="fn-format" data-action="format-menu" aria-label="Text style" title="Text style" aria-expanded="false" aria-controls="fn-format-menu"><span>Aa</span><span class="fn-style-name" data-p="4">Body</span>${icon('chevron-down')}</button>`) +
      group(button('bold','Bold','bold',1), button('italic','Italic','italic',1), button('underline','Underline','underline',2), button('strike','Strikethrough','strikethrough',4), button('code','Inline code','code',5)) +
      group(act('text-color','Text color','baseline',2), act('background-color','Background color','highlighter',2), `<button type="button" class="fn-format" data-action="font-size" data-p="2" aria-label="Font size" title="Font size"><span class="fn-size-name">Size</span>${icon('chevron-down')}</button>`) +
      group(act('cell-background','Cell background','paint-bucket',2).replace('<button','<button data-table-only')) +
      group(button('checklist','Checklist','list-checks',1), button('bullets','Bulleted list','list',3), button('numbered','Numbered list','list-ordered',3)) +
      group(button('quote','Quote','quote',4), button('codeBlock','Code block','square-code',5), button('divider','Divider','minus',5)) +
      group(act('link','Add or edit link','link',2), button('table','Table','table-2',2), act('attach','Image or file','paperclip',3), act('link-note','Link to a note','notebook-pen',5), button('section','Collapsible section','panel-top-open',5)) +
      group(button('clear','Clear formatting','remove-formatting',5)) +
      group(`<button type="button" class="fn-icon fn-insert-trigger" data-action="insert-menu" title="Insert" aria-label="Insert" aria-expanded="false" aria-controls="fn-format-menu">${icon('plus')}</button>`) +
      `<div class="fn-history">${button('undo','Undo','undo-2',1)}${button('redo','Redo','redo-2',1)}</div>`;
    bar.append(menu);
    if (!onNoteLink) bar.querySelector('[data-action="link-note"]')?.remove();
    for (const trigger of bar.querySelectorAll('[aria-controls]')) trigger.setAttribute('aria-controls', menu.id);
    for (const [action] of [...appearanceActions,...tableAppearanceActions]) root.querySelectorAll(`[data-action="${action}"]`).forEach(button => { button.setAttribute('aria-controls',menu.id); button.setAttribute('aria-expanded','false'); });
    close(); schedule(); fit();
  }
  function fit() {
    if (bar.hidden || !bar.clientWidth || !menu.hidden) return;
    const parts = [...bar.querySelectorAll('[data-p]')], groups = [...bar.querySelectorAll('.fn-group')], last = bar.querySelector('.fn-history');
    if (!last) return;
    const groupsFollow = () => { for (const part of groups) part.hidden = ![...part.children].some(child => !child.hidden); };
    const fits = () => last.getBoundingClientRect().right <= bar.getBoundingClientRect().right + 1;
    // Essentials always show; the rest return one at a time, most useful first,
    // for as long as they fit.
    const available = part => !part.hasAttribute('data-table-only') || getEditor()?.isActive('table');
    for (const part of parts) part.hidden = part.dataset.p !== '1' || !available(part);
    groupsFollow();
    // Narrow hosts can have navigation and document actions beside the toolbar.
    // Keep the two menus in reach when even the usual essentials cannot fit.
    for (const command of ['italic','checklist','bold','redo','undo']) {
      if (fits()) break;
      const control = bar.querySelector(`[data-command="${command}"]`);
      if (control) control.hidden = true;
      groupsFollow();
    }
    const optional = parts.filter(part => part.dataset.p !== '1' && available(part)).sort((a, b) => a.dataset.p - b.dataset.p);
    for (const part of optional) {
      part.hidden = false; groupsFollow();
      if (!fits()) { part.hidden = true; groupsFollow(); break; }
    }
  }
  const observer = new ResizeObserver(fit);
  observer.observe(bar);
  function close() {
    releaseMenu?.(); releaseMenu = null;
    menu.hidden = true; bubble.hidden = true;
    root.querySelectorAll('.fn-formatbar [aria-expanded],.fn-selection [aria-expanded]').forEach(b => b.setAttribute('aria-expanded','false'));
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); }); }
  function refresh() {
    const editor = getEditor();
    if (!editor || editor.isDestroyed || !body.getClientRects().length) { bubble.hidden = true; return; }
    const label = bar.querySelector('.fn-style-name');
    const style = editor.isActive('heading') ? 'Heading ' + editor.getAttributes('heading').level : 'Body';
    if (label && label.textContent !== style) { label.textContent = style; fit(); }
    const formatting = selectedTextFormatting(editor.state), sizeLabel = bar.querySelector('.fn-size-name');
    if (bar.dataset.inTable !== String(editor.isActive('table'))) { bar.dataset.inTable = String(editor.isActive('table')); fit(); }
    for (const [action] of appearanceActions) root.querySelectorAll(`[data-action="${action}"]`).forEach(button => { button.disabled = !editor.isEditable || !!editor.state.selection.node || editor.isActive('codeBlock') || editor.isActive('code'); });
    const size = formatting.fontSize === 'mixed' ? 'Mixed' : formatting.fontSize ? parseFloat(formatting.fontSize) + '' : 'Size';
    if (sizeLabel && sizeLabel.textContent !== size) { sizeLabel.textContent = size; fit(); }
    for (const [action, attr] of [['text-color','color'],['background-color','backgroundColor']]) {
      for (const button of root.querySelectorAll(`[data-action="${action}"]`)) {
        button.style.setProperty('--text-swatch', formatting[attr] && formatting[attr] !== 'mixed' ? formatting[attr] : action === 'text-color' ? 'currentColor' : 'transparent');
      }
    }
    for (const button of root.querySelectorAll('[data-command]')) {
      const command = button.dataset.command;
      if (command === 'undo' || command === 'redo') button.disabled = !editor.isEditable || !editor.can()[command]();
      if ([...marks.map(m => m[0]),'checklist','bullets','numbered','quote','codeBlock',...styles.map(([value])=>value)].includes(command)) button.setAttribute('aria-pressed', String(commandState(editor,command)));
    }
    const selection = window.getSelection();
    if (isDrawing(editor) || editor.isActive('codeBlock') || !editor.isFocused || !editor.isEditable || editor.state.selection.empty || editor.state.selection.node || editor.state.selection.$anchorCell || !menu.hidden || isContextOpen() || root.querySelector('dialog[open]') || !selection?.rangeCount || !body.contains(selection.anchorNode) || !body.contains(selection.focusNode)) { bubble.hidden = true; return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect(), toolbar = bar.getBoundingClientRect();
    if (!rect.width || rect.bottom < toolbar.bottom || rect.top > innerHeight) { bubble.hidden = true; return; }
    bubble.hidden = false;
    const width = bubble.offsetWidth, height = bubble.offsetHeight;
    bubble.style.left = Math.max(12, Math.min(innerWidth - width - 12, rect.left + (rect.width - width) / 2)) + 'px';
    bubble.style.top = (rect.top - toolbar.bottom >= height + 8 ? rect.top - height - 8 : rect.bottom + 8) + 'px';
  }
  function show(kind, trigger) {
    const editor = getEditor(); if (!editor?.isEditable) return;
    if (!menu.hidden && anchor === trigger && menu.dataset.kind === kind) { close(); schedule(); return; }
    close(); anchor = trigger; menu.dataset.kind = kind;
    menu.innerHTML = kind === 'text'
      ? items(styles) + '<hr>' + appearanceActions.map(([action,label,glyph]) => `<button type="button" data-action="${action}">${icon(glyph)}<span>${label}</span>${icon('chevron-right')}</button>`).join('') + items(marks) + '<hr>' + items([['clear','Clear formatting','remove-formatting']])
      : kind === 'insert' ? (editor.isActive('table') ? tableAppearanceActions.map(([action,label,glyph]) => `<button type="button" data-action="${action}">${icon(glyph)}<span>${label}</span></button>`).join('') + items([['table-header','Toggle header row','table-2'],['table-to-text','Convert to text','type'],['table-delete','Delete table','trash-2']]) + '<hr>' : '') + items(inserts) + `<button type="button" data-action="link">${icon('link')}<span>Add or edit link</span>${hint('link')}</button><button type="button" data-action="attach">${icon('paperclip')}<span>Image or file</span>${hint('attach')}</button><button type="button" data-action="link-note">${icon('notebook-pen')}<span>Link to a note</span>${hint('link-note')}</button><button type="button" data-action="markdown">${icon('file-code')}<span>Insert Markdown…</span>${hint('markdown')}</button>`
      : appearance.show(kind);
    if (!onNoteLink) menu.querySelector('[data-action="link-note"]')?.remove();
    menu.hidden = false;
    // Keyboard hints are noise where there is no keyboard.
    if (matchMedia('(pointer: coarse)').matches) menu.querySelectorAll('kbd').forEach(key => key.remove());
    releaseMenu = onOpen(() => { close(); anchor?.focus({ preventScroll: true }); });
    const triggerBox = trigger.getBoundingClientRect(), barBox = bar.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(triggerBox.left - barBox.left, bar.clientWidth - menu.offsetWidth - 6)) + 'px';
    trigger.setAttribute('aria-expanded','true');
    if (document.activeElement === trigger) menu.querySelector('button')?.focus();
    refresh();
  }
  function run(command) {
    const editor=getEditor();if(!editor?.isEditable)return;
    close();
    if(command!=='drawing')stopDrawing(editor);
    const action={drawing:()=>startDrawing(editor,root),video:onVideo,link:onLink,attach:onAttach,'link-note':onNoteLink,markdown:onMarkdown}[command];
    if(action)action();else runEditorCommand(editor,command);
    schedule();
  }
  document.addEventListener('keydown',event=>{
    const command=insertShortcut(event,mac),editor=getEditor();
    const pageFocus=isDrawing(editor)&&(event.target===document.body||event.target===document.documentElement||event.target===root||event.target.matches('.fn-note-pane'));
    if(!command||!editor?.isEditable||editor.isDestroyed||root.querySelector('dialog[open]')||!pageFocus&&!root.contains(event.target))return;
    if(event.target.closest('input,textarea,select,[role=dialog]')||!pageFocus&&!body.contains(event.target)&&!event.target.closest('.fn-formatbar,.fn-selection,.fn-draw-overlay,.fn-draw-tools'))return;
    event.preventDefault();event.stopPropagation();run(command);
  },{capture:true,signal});
  root.addEventListener('mousedown', event => { if (event.target.closest('.fn-formatbar button,.fn-selection button')) event.preventDefault(); });
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !button.closest('.fn-formatbar,.fn-selection')) return;
    if (button.closest('.fn-appearance')) return;
    const editor = getEditor(); if (!editor?.isEditable) return;
    event.preventDefault();
    if (button.dataset.command) { run(button.dataset.command); return; }
    const action = button.dataset.action;
    if (action === 'format-menu' || action === 'insert-menu') return show(action === 'format-menu' ? 'text' : 'insert', button);
    if ([...appearanceActions,...tableAppearanceActions].some(([value]) => value === action)) return show(action, (menu.contains(button) || button.closest('.fn-selection')) ? bar.querySelector('[data-action="format-menu"]') : button);
    if(['link','attach','link-note','markdown'].includes(action))run(action);
  });
  menu.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.target.matches('input')) return;
    const buttons = [...menu.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + buttons.length + (event.key === 'ArrowDown' ? 1 : -1)) % buttons.length]?.focus();
    }
    if (event.key === 'Tab' && !menu.querySelector('.fn-appearance')) close();
  });
  menu.addEventListener('focusout', () => requestAnimationFrame(() => { if (!menu.hidden && !menu.contains(document.activeElement) && document.activeElement !== anchor && !getEditor()?.isFocused) close(); }));
  // Pressing a button on the selection bar must not dismiss it before the click lands.
  document.addEventListener('pointerdown', event => { if (!event.target.closest('.fn-formatbar, .fn-selection')) close(); }, {signal});
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); close(); anchor?.focus(); } }, {signal});
  document.addEventListener('selectionchange', schedule, {signal});
  root.querySelector('.fn-note-content').addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { close(); schedule(); }, {signal});
  return { build, close, schedule, fit, destroy() { listeners.abort(); observer.disconnect(); close(); cancelAnimationFrame(frame); bubble.remove(); } };
}

export function editorContext(target, { x, y, source }, { getEditor, onLink, toast, schedule }) {
  const editor = getEditor(); if (!editor) return [];
  const object = objectFromTarget(target) || (source === 'keyboard' && editor.state.selection.node?.type.name === 'previewAttachment' ? editor.view.nodeDOM(editor.state.selection.from) : null);
  const link = target.closest('a[href]:not([data-attachment-download])');
  if (object) {
    const at = editor.view.posAtDOM(object, 0);
    if (editor.state.doc.nodeAt(at)?.type.name !== 'previewAttachment') return [];
    editor.commands.setNodeSelection(at);
  } else if (link && !link.closest('[data-footnote-ref]')) {
    const pos = editor.view.posAtDOM(link, 0);
    const range = getMarkRange(editor.state.doc.resolve(pos), editor.schema.marks.link);
    if (range) editor.commands.setTextSelection(range);
  } else if (source === 'mouse') {
    const pos = editor.view.posAtCoords({ left:x, top:y })?.pos, { from, to, empty } = editor.state.selection;
    if (pos !== undefined && (empty || pos < from || pos > to)) editor.commands.setTextSelection(pos);
  }
  const { from, to } = editor.state.selection, selection = editor.state.selection, doc = editor.state.doc;
  const item = (label, icon, run, extra = {}) => ({ label, icon, run, ...extra });
  const mac = isMacPlatform(), shortcut = mac ? '⌘' : 'Ctrl+', keys = objectShortcutLabels(mac);
  // Stacking choices for a placed object, offered only when they would change what is seen.
  const stackingItems = pos => {
    if (!stackable(editor.state.doc.nodeAt(pos))) return [];
    const choices = stackingChoices(canvasStack(editor.view), pos);
    const act = action => () => { if (getEditor() === editor && editor.isEditable && editor.state.doc === doc) restack(editor.view, pos, action); };
    return [
      ...(choices.forward ? [item('Bring to front','bring-to-front',act('front'),{hint:keys.front}), item('Bring forward','arrow-up',act('forward'),{hint:keys.forward})] : []),
      ...(choices.backward ? [item('Send backward','arrow-down',act('backward'),{hint:keys.backward}), item('Send to back','send-to-back',act('back'),{hint:keys.back})] : []),
    ];
  };
  const copy = async cut => {
    if (getEditor() !== editor || from === to) return;
    try {
      await copyEditorSelection(editor.view);
      if (cut && getEditor() === editor && editor.isEditable && editor.state.doc === doc && editor.state.selection.eq(selection)) editor.chain().focus().deleteSelection().run();
    } catch { toast(`Use ${shortcut}${cut ? 'X' : 'C'} to ${cut ? 'cut' : 'copy'} your selection.`); }
  };
  const values = [item('Copy','copy',() => copy(false), { disabled:from === to, hint:shortcut + 'C' }), ...(editor.isEditable ? [item('Cut','scissors',() => copy(true), { disabled:from === to, hint:shortcut + 'X' }),item('Paste','clipboard-paste',async () => {
    try { await pasteEditorSelection(editor.view, () => getEditor() === editor && editor.isEditable); }
    catch { editor.commands.focus(); toast(`Use ${shortcut}V to paste here.`); }
  }, { hint:shortcut + 'V' })] : []), item('Select all','text-select',() => editor.chain().focus().selectAll().run(), { hint:shortcut + 'A' })];
  if (object) {
    const bar=objectToolbar(object), actions=[], at=editor.state.selection.from;
    const add=(selector,label,glyph,extra={})=>{
      const control=bar?.querySelector(selector);
      if(control)actions.push(item(label,glyph,()=>{if(getEditor()===editor&&object.isConnected)control.click()},{...extra,disabled:control.disabled}));
    };
    add('[data-object="format-image"]','Format image…','crop');
    add('[data-object="edit-video"]','Edit video link…','link');
    add('[data-object="stop-video"]','Stop video','square');
    add('[data-object="left"]','Place left','arrow-left-to-line');
    add('[data-object="line"]','Place on its own line','stretch-horizontal');
    add('[data-object="right"]','Place right','arrow-right-to-line');
    add('[data-attachment-download]',object.classList.contains('fn-drawing')?'Download as PNG':'Download','download');
    const stack=editor.isEditable?stackingItems(at):[];
    if(stack.length){if(actions.length)actions.push({separator:true});actions.push(...stack);}
    if(actions.length)actions.push({separator:true});
    if(editor.isEditable)actions.push(item('Duplicate','copy-plus',()=>{if(getEditor()===editor&&editor.isEditable&&editor.state.doc===doc){editor.commands.setNodeSelection(at);duplicateObject(editor.view);}},{hint:keys.duplicate}));
    actions.push(...values.slice(0,-1));
    add('[data-object="delete"]',object.classList.contains('fn-drawing')?'Delete drawing':object.classList.contains('fn-video')?'Delete video':object.classList.contains('fn-image')?'Delete image':'Delete attachment','trash-2',{danger:true,hint:mac?'⌫':'Delete'});
    return actions;
  }
  const href = markdownURL(link?.getAttribute('href') || (source === 'keyboard' && editor.isActive('link') ? editor.getAttributes('link').href : null));
  if (href) values.unshift(item('Open link','external-link',() => followEditorLink(editor.view.dom,href)), {separator:true});
  // A placed table or code block is a stackable object too, right-clicked from inside.
  const $from = editor.state.selection.$from, holderPos = $from.depth ? $from.before(1) : null;
  const holder = holderPos === null ? null : editor.state.doc.nodeAt(holderPos);
  const holderStack = editor.isEditable && holder ? stackingItems(holderPos) : [];
  if (!editor.isEditable) return values;
  if (editor.isActive('codeBlock')) return holderStack.length ? [...values, {separator:true}, ...holderStack] : values;
  const markKeys = { bold:'B', italic:'I', underline:'U' };
  values.push({separator:true}, ...marks.slice(0,3).map(([value,label,glyph]) => item(label,glyph,() => { if (getEditor() === editor && editor.isEditable) { runEditorCommand(editor,value); schedule(); } }, { hint:markKeys[value] ? shortcut + markKeys[value] : undefined })), item('Add or edit link…','link',onLink,{ hint:shortcut + 'K' }));
  if (target.closest('td,th') && editor.isActive('table')) {
    const tableAction = (label, glyph, command, danger = false) => item(label, glyph, () => {
      if (getEditor() === editor && editor.isEditable) editor.chain().focus()[command]().run();
    }, {danger});
    values.push({separator:true},
      tableAction('Add row above','rows-3','addRowBefore'),
      tableAction('Add row below','rows-3','addRowAfter'),
      tableAction('Add column before','columns-3','addColumnBefore'),
      tableAction('Add column after','columns-3','addColumnAfter'),
      {separator:true},
      tableAction('Delete row','trash-2','deleteRow',true),
      tableAction('Delete column','trash-2','deleteColumn',true));
  }
  if (holderStack.length) values.push({separator:true}, ...holderStack);
  return values;
}
