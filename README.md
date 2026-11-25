# OhDocs Editor

A rich text editor built on Tiptap and ProseMirror. Write Markdown, draw shapes, edit tables, and move, resize or rotate media on the page. [Try the live editor](https://ohdocs.com).

## Quick start

Install the built package from [GitHub Releases](https://github.com/mjdileep/ohdocs-editor/releases).

```sh
npm install https://github.com/mjdileep/ohdocs-editor/releases/download/v1.10.0/ohdocs-editor-1.10.0.tgz
```

Add an empty `<div id="editor"></div>` to your page. In your browser entry module:

```js
import { createEditor } from '@ohdocs/editor'
import '@ohdocs/editor/style.css'

const notebook = createEditor(document.getElementById('editor'), {
  onChange(editor) { console.log(editor.getJSON()) }
})
```

`createEditor` provides the toolbar, drawing tools, context menu, imports and a local English spelling worker. To restore an editor, pass `content` (document JSON) and `files` (a Map of attachment IDs to File objects). Call `notebook.snapshot()` to get both together as `{doc, files}`. `notebook.editor` is the Tiptap editor. Call `notebook.destroy()` to release resources when unmounting. Pass `editable: false` for a reader, or set `--oh-editor-height` on the host to adjust its height.

A bundler must serve the spelling worker alongside the entry point or supply its URL. For Vite builds, for example, import `workerURL` from `'@ohdocs/editor/spelling-worker.js?url'` and pass `spellingWorkerURL: workerURL`. For a plain static page, serve the release’s `editor/` directory and import `./editor/index.js` plus the stylesheet `./editor/editor.css`.

## Run the playground locally

Use Node 24 or later. From the repository root:

```sh
npm ci
npm test
npm run demo
```

Open http://127.0.0.1:4173. The first note is an editable field guide with a planting diagram, seed-count CSV, table, drawing, video, code, Markdown, and math examples. Reopen it from **Note options → Open editor guide**. The notes list also includes an illustrated note on Ceylon and cassia cinnamon. Each sample is added once per browser. The playground supports multiple drafts and stores their documents and attachments in IndexedDB in this browser. Download saves the current note and its attachments as an `.ohdocs` file. Use Upload beside New note to open an `.ohdocs` file or an earlier `.ohdocs.json` export. Browser storage can be cleared by the user or browser. Visible videos load a thumbnail or a paused frame from the media host. Playback starts on Play. To enable these previews in an embedded editor, pass `videoPreviews: true` to `createEditor`. If your site uses a Content Security Policy, Vimeo thumbnails require `connect-src https://vimeo.com/api/oembed.json` and `img-src https://i.vimeocdn.com`.

To self-host, extract the playground archive from Releases into a static HTTPS web root. Alternatively run `npm run build` and serve the contents of `site/`. The playground needs no accounts or application server.

## Integration

Use the browser bundle for the full editor. Hosts that supply their own toolbar can assemble the lower-level editor with `createNotebook` in `src/editor.js`. Pass a document, attachment map and callbacks for storage and navigation. `format/` contains the versioned schema, migration helpers and read-only renderer for browser and server applications. Application accounts, billing, encryption and sharing are outside this package.

### Objects and drawing

Images, drawings, videos, files, tables and code blocks are objects. On pages wider than 560px they can sit anywhere on the page and overlap; each one's `layer` attribute is its stacking order. Drag the side or bottom grip to change one dimension. Corners scale media proportionally and adjust both dimensions on a table, file or code block. Images, video and drawings stretch along the dragged axis. Click their rotation handle for a quarter turn or drag it for any angle. Shift snaps rotation to 15° steps. Double-click a size grip to reset it. A focused grip also accepts arrow keys for 1px adjustments, or Shift with an arrow for 10px.

| Keys (Mac / others) | With an object selected |
|---|---|
| Arrow keys, Shift+arrow | Move it 1px or 10px. A quick run of presses undoes as one step. |
| ⌘] / Ctrl+], ⌘[ / Ctrl+[ | Bring forward, send backward: past the next object it overlaps. |
| ⇧⌘] / Ctrl+Shift+], ⇧⌘[ / Ctrl+Shift+[ | Bring to front, send to back. |
| ⌘D / Ctrl+D | Duplicate it, 16px down and right. |
| Escape | Let go of it. Inside a table cell, Escape first selects the table. |
| Delete, Backspace, ⌘C, ⌘X, ⌘V, ⌘Z | As usual. |

The right-click menu (`editorContext` in `src/editor-controls.js`) offers the stacking moves only when they would change what is seen, and shows each item's shortcut.

Drawing mode has pen (P), highlighter (H), line (L), arrow (A), rectangle (R), ellipse (O), diamond (D) and eraser (E); number keys pick the toolbar's inks; `[` and `]` change the thickness; Escape drops a stroke in progress, then leaves drawing. While drawing a shape, Shift keeps lines to 45° steps and boxes square, and Option or Alt draws from the centre. The compact Lines, Arrows and Shapes split buttons remember the last choice in each group. Their icon menus offer 38 tools: six lines/connectors, twelve arrows and twenty shapes (polygons, stars, heart, cloud, callout, cylinder and cube included). Arrow keys navigate the menus; Enter selects; Escape closes the menu first. Shapes are saved as ordinary drawing strokes (`src/drawing-shapes.js`), so they need no new document format and keep normal movement, resizing, erasing and public rendering.

## Theme

The standalone stylesheet supplies these theme variables. Override them on `.oh-editor` to customize the editor.

| Variable | Used for |
|---|---|
| `--n-bg` | Menus, toolbars, table frames, object toolbars and grips. |
| `--n-ink` | Text. |
| `--n-muted` | Secondary text, icons, quotes and placeholders. |
| `--n-line` | Borders, dividers and table rules. |
| `--n-soft` | Selected cells, pressed buttons, menu hover and quote rules. |
| `--n-accent` | Links, the caret, selection outlines and active grips. |
| `--n-on` | Text and icons on `--n-accent`. |
| `--n-side` | File cards and header cells of plain tables. |
| `--n-mark` | Highlighted text. |
| `--n-danger` | Destructive menu items. |
| `--n-hover` | Hover background of toolbar and object buttons. |
| `--n-lift` | Shadow under object toolbars and resize grips. |
| `--n-elevation` | Shadow under menus and the selection toolbar. |
| `--n-text-font`, `--n-text-size` | Document text. |
| `--n-heading-font`, `--n-heading-weight` | Headings. h1 and h2 use the weight; h3 to h6 are 650. |
| `--home-font` | Menu text and the video error message. Optional: without it, menus use the surrounding font and the video message `sans-serif`. |

A few neutral shades (shadows, alignment guides, syntax colours, video surfaces) use `light-dark()`, so the app sets `color-scheme` for dark mode. The editor's scripts set `--gap`, `--offset`, `--fill`, `--text-swatch`, `--fn-ink-height` and `--fn-draw-room` on its own elements; apps never set those.

### Scope

Every stylesheet nests its rules in `:is(:root, #fn-scope)`. That matches the whole page but weighs as much as one id, so the editor's rules rank like an app's own id-scoped rules, such as SafeFN's `#family-notes ...`. Override them with variables, or with a selector of at least one id. No element should have the id `fn-scope`.

`base.css` resets the editor's own elements (box sizing, `[hidden]`, buttons, form fields and icon sizes), so they look the same without the app's resets.

## Document format versions

`FORMAT_VERSION` (now 3) changes only when saved documents can contain a node, mark or attribute the previous editor does not know. Format 1 documents carry no marker. From format 2 on, every saved document records its format as `doc.attrs.format`: the `DocumentFormat` extension (`src/document-format.js`) keeps the marker in the editor and stamps documents that have none, and `migrateDocument` records the format it upgrades a document to.

When an editor opens a newer document, `createNotebook` opens it read-only and shows unknown content as a short placeholder (`displayableDocument`), so an older app version can never save over content it does not understand. SafeFN also explains why, and its server refuses to replace a note with an older format.

To move to a new format:

1. Raise `FORMAT_VERSION` in `format/schema.mjs`, and add new node and mark types to `nodeTypes` and `markTypes`.
2. If existing content changes shape, add a step to `migrations` for the previous format. Documents are upgraded where they are opened, because encrypted documents never reach a server in readable form.
3. Run `npm test`. `src/document-format.test.mjs` checks that the editor saves the new version.
4. Release every app that uses the editor. Until people reload, their older copies open notes saved in the new format read-only.

## Versioning the package

Semantic versioning in `package.json`, with every change listed in `CHANGELOG.md`: major for changes apps must adapt to, minor for new features, patch for fixes. Releases record the version they were built with.

## Tests

```bash
npm test
```

This writes the editor's own icon set to `src/.build/icons.json`, then runs the tests in `src/` and `format/`.

## Contact

Contact or follow me at [@doubledescent0 on X](https://x.com/doubledescent0).

## License

Original editor code is MIT licensed. The sample photographs retain their [individual licenses and credits](demo/topics/media/CREDITS.md). The compiled distribution includes dependency licenses in `dist/THIRD-PARTY-NOTICES.txt`.
