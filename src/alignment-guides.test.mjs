import test from 'node:test'
import assert from 'node:assert/strict'
import { createDragAlignment } from './alignment-guides.js'

test('guide feedback is clipped to the editor, hides on bypass and leaves no overlay on cleanup', () => {
  const originals = { document: globalThis.document, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight }
  try {
    const element = () => {
      const attrs = new Map(), classes = new Set()
      return { style: {}, dataset: {}, children: [], classList: { add: name => classes.add(name) },
        setAttribute: (name, value) => attrs.set(name, value), getAttribute: name => attrs.get(name),
        hasAttribute: name => attrs.has(name), toggleAttribute: (name, on) => on ? attrs.set(name, '') : attrs.delete(name),
        append(child) { this.children.push(child); child.parent = this },
        remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1) },
      }
    }
    globalThis.document = { createElementNS: element }
    globalThis.innerWidth = 1200; globalThis.innerHeight = 800
    const host = element(), page = { left: 200, right: 1000, top: -100, width: 800, height: 1600 }
    const target = { pos: 0, box: { x: 296, y: 197, width: 80, height: 40 } }
    const view = { state: { doc: { forEach() {} } }, dom: { parentElement: element(), closest: () => ({ getBoundingClientRect: () => ({ left: 0, right: 1200, top: 64, bottom: 800 }) }) } }
    const items = [target, { pos: 1, box: { x: 300, y: 200, width: 120, height: 80 } }]
    // Without the app's root element the guides go next to the editor.
    const fallback = createDragAlignment(view, { page, target, items })
    assert.equal(view.dom.parentElement.children.length, 1)
    fallback.destroy()
    assert.equal(view.dom.parentElement.children.length, 0)
    const feedback = createDragAlignment(view, { page, target, items }, host)
    const overlay = host.children[0]
    assert.equal(view.dom.parentElement.children.length, 0, 'guides mount in the root element')
    assert.equal(overlay.hasAttribute('hidden'), true, 'SVG visibility uses a real attribute')
    feedback.paint(feedback.snap(target.box, page, false).guides, page)
    assert.equal(overlay.hasAttribute('hidden'), false)
    assert.deepEqual([overlay.style.left, overlay.style.top, overlay.style.width, overlay.style.height], ['200px', '64px', '800px', '736px'])
    assert.equal(overlay.children[0].dataset.axis, 'x')
    assert.equal(overlay.children[0].getAttribute('x1'), '300')
    const bypass = feedback.snap(target.box, page, true)
    feedback.paint(bypass.guides, page)
    assert.equal(overlay.hasAttribute('hidden'), true)
    assert.deepEqual(bypass.box, target.box)
    feedback.destroy()
    assert.equal(host.children.length, 0)
  } finally { Object.assign(globalThis, originals) }
})
