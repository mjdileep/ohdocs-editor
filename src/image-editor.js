import { imageFormat, formattedImage, transformImageFormat, imagePresets, applyImagePreset, imagePreset } from '../format/image-format.mjs'
import { closeHistory } from '@tiptap/pm/history'
import { icon } from './icons.js'

export function editImage({ editor, node, position, image, showDialog, closeDialog }) {
  if (!image?.naturalWidth || !editor.isEditable) return
  const doc = editor.state.doc
  let format = imageFormat(node.attrs.imageFormat || { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })
  let mode = 'crop', start, frame
  const button = (action, title, glyph, pressed) => `<button type="button" class="fn-icon" data-image-tool="${action}" title="${title}" aria-label="${title}"${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${icon(glyph)}</button>`
  const adjustments = [['brightness','Light',-100,100],['contrast','Contrast',-100,100],['saturation','Saturation',-100,100],['warmth','Warmth',-100,100],['hue','Hue',-180,180]]
  const slider = ([key,label,min,max]) => `<label class="fn-image-adjust"><span>${label}</span><input type="range" data-adjust="${key}" aria-label="${label}" min="${min}" max="${max}" step="1"><output data-output="${key}"></output></label>`
  const dialog = showDialog('Image', `<div class="fn-image-tools" role="toolbar" aria-label="Image tools">${button('crop','Crop','crop',true)}${button('color','Adjust colors','sliders-horizontal',false)}<span class="fn-tool-divider"></span>${button('rotate','Rotate clockwise','rotate-cw')}${button('flipX','Flip horizontal','flip-horizontal-2')}${button('flipY','Flip vertical','flip-vertical-2')}<span class="fn-tool-spacer"></span>${button('reset','Reset image','rotate-ccw')}<button type="button" class="fn-icon" data-close-action aria-label="Cancel image changes" title="Cancel">${icon('x')}</button></div>
    <div class="fn-image-preview"><div class="fn-image-crop-stage"></div><div class="fn-crop-box"></div></div>
    <div class="fn-image-adjustments" hidden><div class="fn-image-preset"><select aria-label="Color preset" title="Color preset">${[...imagePresets.map(([name])=>name),'Custom'].map(name=>`<option>${name}</option>`).join('')}</select></div><div class="fn-image-sliders">${adjustments.map(slider).join('')}<label class="fn-image-adjust fn-image-tint"><span>Tint</span><input type="color" aria-label="Tint color"><input type="range" data-adjust="tintAmount" aria-label="Tint strength" min="0" max="100"><output data-output="tintAmount"></output></label></div></div>
    <div class="fn-image-footer"><span class="muted" data-image-hint>Drag to crop</span><button type="button" class="fn-icon" data-image-compare title="Hold to compare colors" aria-label="Compare colors">${icon('square-split-horizontal')}</button><button class="fn-button fn-primary">Apply</button></div>`, () => {
    if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== doc || doc.nodeAt(position) !== node) throw new Error('The note changed. Open the image again.')
    editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(position, null, { ...node.attrs, imageFormat: format }))
    editor.view.dispatch(closeHistory(editor.state.tr))
    closeDialog()
  })
  // This dialog has its own compact toolbar; keep the accessible name without
  // spending a second row on a heading and another close button.
  dialog.classList.add('fn-image-dialog')
  dialog.addEventListener('close',()=>{dialog.classList.remove('fn-image-dialog');cancelAnimationFrame(frame)},{once:true})
  const preview = dialog.querySelector('.fn-image-preview'), stage = dialog.querySelector('.fn-image-crop-stage'), box = dialog.querySelector('.fn-crop-box')
  const panel = dialog.querySelector('.fn-image-adjustments'), preset = panel.querySelector('select')
  const paint = (compare = false) => {
    if (frame) cancelAnimationFrame(frame)
    frame = null
    const current = mode === 'crop' ? {...format,x:0,y:0,width:1,height:1} : format
    const showing = compare ? applyImagePreset(current,'Original') : current
    const sideways = showing.rotation % 180 !== 0
    const ratio = (sideways ? showing.naturalHeight / showing.naturalWidth : showing.naturalWidth / showing.naturalHeight) * showing.width/showing.height
    preview.style.width = Math.min(560, window.innerHeight * .42 * ratio) + 'px'
    stage.innerHTML = formattedImage(image.currentSrc || image.src, showing, image.alt)
    box.hidden = compare || mode !== 'crop'
    Object.assign(box.style, { left: format.x*100+'%', top: format.y*100+'%', width: format.width*100+'%', height: format.height*100+'%' })
  }
  const sync = () => {
    panel.hidden = mode !== 'color'
    preview.classList.toggle('is-cropping', mode === 'crop')
    dialog.querySelector('[data-image-hint]').textContent = mode === 'crop' ? 'Drag to crop' : ''
    for (const control of dialog.querySelectorAll('[data-adjust]')) {
      control.value = format[control.dataset.adjust]
      dialog.querySelector(`[data-output="${control.dataset.adjust}"]`).textContent = control.value
    }
    panel.querySelector('[type=color]').value = format.tintColor
    preset.value = imagePreset(format)
    for (const key of ['crop','color']) dialog.querySelector(`[data-image-tool="${key}"]`).setAttribute('aria-pressed',String(mode === key))
    paint()
  }
  preview.onpointerdown = event => {
    if (event.button || mode !== 'crop') return
    event.preventDefault(); preview.setPointerCapture(event.pointerId)
    start = { x: event.clientX, y: event.clientY, format: { ...format } }
  }
  preview.onpointermove = event => {
    if (!start) return
    const rect = preview.getBoundingClientRect()
    const unit = (value, origin, length) => Math.max(0, Math.min(1, (value-origin)/length))
    const x1 = unit(start.x, rect.left, rect.width), x2 = unit(event.clientX, rect.left, rect.width)
    const y1 = unit(start.y, rect.top, rect.height), y2 = unit(event.clientY, rect.top, rect.height)
    format = imageFormat({ ...format, x: Math.min(x1,x2), y: Math.min(y1,y2), width: Math.max(.01,Math.abs(x2-x1)), height: Math.max(.01,Math.abs(y2-y1)) })
    paint()
  }
  preview.onpointerup = () => { start = null }
  preview.onpointercancel = () => { if(start)format=start.format; start=null; paint() }
  for (const control of dialog.querySelectorAll('[data-adjust]')) control.oninput = () => {
    format = imageFormat({...format,[control.dataset.adjust]:Number(control.value)})
    dialog.querySelector(`[data-output="${control.dataset.adjust}"]`).textContent = control.value
    preset.value = imagePreset(format)
    if (!frame) frame = requestAnimationFrame(()=>paint())
  }
  panel.querySelector('[type=color]').oninput = event => {
    format = imageFormat({...format,tintColor:event.target.value,tintAmount:format.tintAmount || 35}); sync()
  }
  preset.onchange = () => { if(preset.value !== 'Custom')format = applyImagePreset(format,preset.value); sync() }
  for (const control of dialog.querySelectorAll('[data-image-tool]')) control.onclick = () => {
    const tool = control.dataset.imageTool
    if (tool === 'crop' || tool === 'color') mode = tool
    else if (tool === 'reset') format = imageFormat({ naturalWidth:image.naturalWidth, naturalHeight:image.naturalHeight })
    else format = transformImageFormat(format, tool)
    sync()
  }
  const compare = dialog.querySelector('[data-image-compare]')
  compare.onpointerdown = event => {event.preventDefault();compare.setPointerCapture(event.pointerId);paint(true)}
  compare.onpointerup = compare.onpointercancel = compare.onlostpointercapture = () => paint()
  compare.onkeydown = event => {if([' ','Enter'].includes(event.key)){event.preventDefault();paint(true)}}
  compare.onkeyup = event => {if([' ','Enter'].includes(event.key)){event.preventDefault();paint()}}
  compare.onblur = () => paint()
  sync()
  dialog.querySelector('[data-image-tool="crop"]').focus({preventScroll:true})
}
