import test from 'node:test'
import assert from 'node:assert/strict'
import { renderDoc } from './render.mjs'

const doc = (...content) => ({ type: 'doc', content })

test('rendered documents escape text and drop unsafe links', () => {
  const html = renderDoc(doc({ type: 'paragraph', content: [
    { type: 'text', text: '<script>alert(1)</script>' },
    { type: 'text', text: 'bad', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
    { type: 'text', text: 'good', marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }, { type: 'bold' }] },
  ] }))
  assert.equal(html.includes('<script>'), false)
  assert.match(html, /&lt;script&gt;/)
  assert.equal(html.includes('javascript:'), false)
  assert.match(html, /<strong><a href="https:\/\/example.com\/" rel="noreferrer noopener">good<\/a><\/strong>/)
})

test('text styles become shared classes and invalid colors are ignored', () => {
  const styles = new Map()
  const html = renderDoc(doc({ type: 'paragraph', content: [
    { type: 'text', text: 'blue', marks: [{ type: 'textStyle', attrs: { color: '#1d4ed8' } }] },
    { type: 'text', text: 'again', marks: [{ type: 'textStyle', attrs: { color: '#1D4ED8' } }] },
    { type: 'text', text: 'unsafe', marks: [{ type: 'textStyle', attrs: { color: 'url(x)' } }] },
  ] }), styles)
  assert.deepEqual([...styles.keys()], ['color:#1d4ed8'])
  assert.equal(html.match(/fn-text-0/g).length, 2)
  assert.match(html, /unsafe/)
})

test('published media and content blocks preserve validated frame dimensions', () => {
  const styles = new Map()
  const html = renderDoc(doc(
    { type: 'previewAttachment', attrs: {videoSource:'https://example.test/movie.mp4',frameRatio:1.5,width:300} },
    { type: 'codeBlock', attrs: {minHeight:125} },
    { type: 'table', attrs: {minHeight:'invalid'} },
  ),styles)
  assert.match(html,/data-frame-ratio="1.5"/)
  assert.deepEqual([...styles.keys()],['--fn-frame-ratio:1.5;width:300px','--fn-min-height:125px'])
})
