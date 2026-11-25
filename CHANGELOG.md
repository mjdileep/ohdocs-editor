# Changelog

## 1.10.1

Refocus the water sample on Sri Lanka’s historic tank villages, with a new cascade diagram and an account of seasonal land sharing. Existing browsers refresh the original sample if it has never been edited.

## 1.10.0

Add four editable, illustrated notebooks on cinnamon, graphene, water management and transformer attention. Their images and the Python example travel with exported notes.

## 1.9.4

Show YouTube and Vimeo thumbnails and paused frames for direct video files as they come into view in OhDocs.

## 1.9.3

Open links in notes with a click or tap, or choose Open link from the context menu. Footnote links scroll within the current note.

## 1.9.2

Use “Contact or follow me on X” for the personal profile link.

## 1.9.1

Add a hands-on editor guide with editable examples and local attachments. Move the public repository and release links to mjdileep/ohdocs-editor.

## 1.9.0

Standalone browser entry point, default theme, lazy spelling worker and local-first playground with portable document and attachment files.

## 1.8.0 — 18 November 2026

- Download an individual drawing as a transparent PNG from its toolbar or context menu. The export preserves its size, rotation and highlighter opacity.

## 1.7.0 — 18 November 2026

- Images, video players and drawings stretch along either local axis. Their rotation handle supports free rotation, 15° snapping and quarter turns. Document format 3 preserves rotation in saved documents, clipboard copies and public pages.

## 1.6.0 — 18 November 2026

- Drag a side or bottom grip to resize one dimension. Image, video and drawing corners retain the current proportions. Table, file and code corners adjust both dimensions, and their contents can grow to fit. Document format 2 stores custom frames and minimum heights.

## 1.5.0 — 18 November 2026

- The pen can recognize a shape across several strokes, even with gaps, overshot corners or sides drawn out of order. Lift to choose the suggested shape or keep drawing. Holding at the end previews the whole shape. Undo and Restore sketch recover the individual strokes in their original positions.
- Tap an earlier sketch with the pen to bring its shape suggestion back. Recognition handles bowed boxes and uneven star outlines, and offers explicit smoothing for freeform contours. A shape can be changed directly from its suggestion.

## 1.4.0 — 18 November 2026

- The pen recognizes single-stroke sketches. Lift to keep the ink and optionally use a suggested shape, or pause at the end for a live preview and release to apply it. Restore sketch and Undo recover the original ink.

- Grouped drawing tools into compact Lines, Arrows and Shapes palettes with 38 choices. Each split button remembers its last-used tool for quick reuse; existing shortcuts still work.
- Added curved and elbow connectors, double-ended and block arrows, rounded rectangles, polygons, stars, a heart, cross, cloud, speech bubble, cylinder and cube. Shapes remain ordinary strokes, compatible with existing saved documents and public readers.
- Menus support keyboard navigation, shape previews and labels, and stay above the drawing surface. Escape or a click on the page dismisses a menu without drawing a stray stroke or leaving drawing mode.

## 1.3.1 — 17 November 2026

- Moving a selected object with the arrow keys keeps it selected in documents containing code blocks. Code blocks no longer rewrite their content DOM after unrelated edits, and their language class is treated as display metadata rather than a content edit. Typing, language changes and read-only controls continue to update normally.

## 1.3.0 — 17 November 2026

- Stacking order for overlapping objects: Bring to front, Bring forward, Send backward and Send to back, in the right-click menu (offered only when they change what is seen) and as ⌘] / ⌘[ with and without Shift (Ctrl on Windows and Linux).
- A selected object moves with the arrow keys (1px, or 10px with Shift), duplicates with ⌘D, and lets go with Escape.
- Drawing gains line, arrow, rectangle, ellipse and diamond tools (L, A, R, O, D) with Shift and Option/Alt constraints, six ink swatches (number keys) beside the colour picker, and Escape now drops a stroke in progress before leaving. Shapes are stored as ordinary strokes, labelled with their shape.
- Right-click menu items show their keyboard shortcuts. After the menu closes, the editor gets the keyboard back, so a selected object keeps answering keys.

## 1.2.0 — 17 November 2026

- Documents keep their format version through the editor. The `DocumentFormat` extension holds `doc.attrs.format` and stamps unmarked documents from format 2 on, and `migrateDocument` records the format it upgrades to. Format 1 documents still save without a marker, so saved notes do not change yet. Before this, raising `FORMAT_VERSION` alone would have dropped the marker on every save.
- The README lists the steps for moving to a new format and the layout details the toolbar and placement code still assume.

## 1.1.1 — 17 November 2026

- The editor no longer looks for SafeFN's `#family-notes` element. The table menu, floating object toolbars, alignment guides and drop outline go in the `root` element the app passes to `createNotebook`, so OhDocs gets the same floating toolbars over pictures, drawings and videos as SafeFN. SafeFN's `root` is `#family-notes`, so it behaves as before.
- Without a `root`, object toolbars stay inside their object, the table menu and alignment guides go next to the editor, and the drop outline goes in the page body, as before.

## 1.1.0 — 17 November 2026

- The editor's styles moved here from SafeFN, so any app gets a fully styled editor: content, plain tables, menus, the selection toolbar, the format bar, colour and size pickers, tables with grips, objects and their placement on the page. Import `styles/editor.css` after the app's own styles.
- New theme variables, listed in the README: `--n-on`, `--n-side`, `--n-mark`, `--n-danger`, `--n-hover`, `--n-lift`, `--n-elevation`, `--n-text-font`, `--n-text-size`, `--n-heading-font` and `--n-heading-weight`.
- Every rule is nested in `:is(:root, #fn-scope)` instead of SafeFN's `#family-notes`, so the styles apply in any app with the same weight as an app's id-scoped rules. `base.css` resets the editor's own buttons, fields and icons.
- Narrow-page stacking needs a container named `page` around the document.

## 1.0.0 — 17 November 2026

- Extracted from SafeFN into a package: the editor from `web/`, and the toolbar, spelling worker and shared validators from `app/`.
- Document format 1 is now defined here. The allowed content (`format/schema.mjs`) and the read-only HTML renderer (`format/render.mjs`) moved from SafeFN's server.
- Newer-format guard: a document saved by a newer editor opens read-only, with unknown content shown as a placeholder. `migrateDocument()` is ready for future format changes.
- Apps build their own icon set with `scripts/icons.mjs`. Icons are sorted, so the same sources give the same bundle on every operating system.
- `scripts/release.mjs` packs the format code into app releases and checks dependency versions match.
- Declared as ES modules. esbuild is no longer a dependency; each app owns its build tools.
