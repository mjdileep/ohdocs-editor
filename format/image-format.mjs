const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function imageFormat(value) {
  if (!value || typeof value !== 'object') return null;
  const x = clamp(value.x, 0, .99, 0), y = clamp(value.y, 0, .99, 0);
  return {
    x, y, width: clamp(value.width, .01, 1 - x, 1 - x), height: clamp(value.height, .01, 1 - y, 1 - y),
    rotation: [90, 180, 270].includes(value.rotation) ? value.rotation : 0,
    flipX: value.flipX === true, flipY: value.flipY === true,
    brightness: clamp(value.brightness, -100, 100, 0), contrast: clamp(value.contrast, -100, 100, 0),
    saturation: clamp(value.saturation, -100, 100, 0), warmth: clamp(value.warmth, -100, 100, 0), hue: clamp(value.hue, -180, 180, 0),
    tintColor: /^#[0-9a-f]{6}$/i.test(value.tintColor) ? value.tintColor.toLowerCase() : '#15805e', tintAmount: clamp(value.tintAmount, 0, 100, 0),
    effect: ['sepia','invert'].includes(value.effect) ? value.effect : 'none',
    naturalWidth: clamp(value.naturalWidth, 1, 50000, 1000), naturalHeight: clamp(value.naturalHeight, 1, 50000, 1000),
  };
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function formattedImage(source, value, label = 'Image') {
  const format = imageFormat(value);
  if (!format) return '';
  const { naturalWidth: width, naturalHeight: height, rotation, flipX, flipY } = format;
  const sideways = rotation === 90 || rotation === 270;
  const w = sideways ? height : width, h = sideways ? width : height;
  const rotate = { 0:'', 90:`translate(${height} 0) rotate(90)`, 180:`translate(${width} ${height}) rotate(180)`, 270:`translate(0 ${width}) rotate(270)` }[rotation];
  const flip = `translate(${flipX ? width : 0} ${flipY ? height : 0}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`;
  const { definitions, reference } = imageFilter(format);
  return `<svg class="fn-formatted-image" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" viewBox="${format.x*w} ${format.y*h} ${format.width*w} ${format.height*h}" role="img" aria-label="${escape(label)}">${definitions}<g transform="${rotate}"><g transform="${flip}"><image${reference} href="${escape(source)}" width="${width}" height="${height}"/></g></g></svg>`;
}

// Keep the selected image region through rotations and flips in screen space.
export function transformImageFormat(value, action) {
  const f = imageFormat(value);
  if (!f) return null;
  if (action === 'rotate') return imageFormat({ ...f, rotation: (f.rotation + 90) % 360, x: 1-f.y-f.height, y: f.x, width: f.height, height: f.width });
  if (action === 'flipX' || action === 'flipY') {
    const axis = f.rotation % 180 ? (action === 'flipX' ? 'flipY' : 'flipX') : action;
    return imageFormat({ ...f, [axis]: !f[axis], ...(action === 'flipX' ? { x: 1-f.x-f.width } : { y: 1-f.y-f.height }) });
  }
  return f;
}

const colorDefaults = { brightness:0, contrast:0, saturation:0, warmth:0, hue:0, tintColor:'#15805e', tintAmount:0, effect:'none' };
export const imagePresets = [
  ['Original',{}], ['Vivid',{contrast:12,saturation:30}], ['Soft',{brightness:5,contrast:-15,saturation:-10}],
  ['B&W',{saturation:-100}], ['Warm',{warmth:45}], ['Cool',{warmth:-45}], ['Sepia',{effect:'sepia'}], ['Invert',{effect:'invert'}],
];
export function applyImagePreset(value, name) {
  const preset = imagePresets.find(([label])=>label===name);
  return imageFormat({ ...value, ...colorDefaults, ...preset?.[1] });
}
export function imagePreset(value) {
  const format = imageFormat(value);
  return imagePresets.find(([,preset])=>Object.entries({...colorDefaults,...preset}).every(([key,value])=>format[key]===value))?.[0] || 'Custom';
}
function imageFilter(f) {
  if (Object.entries(colorDefaults).every(([key,value])=>key==='tintColor'||f[key]===value)) return {definitions:'',reference:''};
  // Values are normalized numbers/enums/hex; identical settings may share an ID.
  const id='fn-image-tone-'+[f.brightness,f.contrast,f.saturation,f.warmth,f.hue,f.tintAmount].map(n=>String(n).replaceAll('.','d')).join('_')+'_'+f.tintColor.slice(1)+'_'+f.effect;
  const contrast=1+f.contrast/100, slope=2**(f.brightness/50)*contrast, intercept=(1-contrast)/2;
  const warmth=f.warmth/100, amount=f.tintAmount/100, rgb=f.tintColor.slice(1).match(/../g).map(n=>parseInt(n,16)/255);
  const transfer=`<feComponentTransfer>${['R','G','B'].map(c=>`<feFunc${c} type="linear" slope="${slope}" intercept="${intercept}"/>`).join('')}</feComponentTransfer>`;
  const warm=`<feColorMatrix type="matrix" values="${1+warmth*.2} 0 0 0 ${warmth*.04} 0 1 0 0 0 0 0 ${1-warmth*.2} 0 ${-warmth*.04} 0 0 0 1 0"/>`;
  const effect=f.effect==='sepia'?'<feColorMatrix type="matrix" values=".393 .769 .189 0 0 .349 .686 .168 0 0 .272 .534 .131 0 0 0 0 0 1 0"/>':f.effect==='invert'?'<feComponentTransfer><feFuncR type="table" tableValues="1 0"/><feFuncG type="table" tableValues="1 0"/><feFuncB type="table" tableValues="1 0"/></feComponentTransfer>':'';
  const tint=amount?`<feColorMatrix type="matrix" values="${1-amount} 0 0 0 ${rgb[0]*amount} 0 ${1-amount} 0 0 ${rgb[1]*amount} 0 0 ${1-amount} 0 ${rgb[2]*amount} 0 0 0 1 0"/>`:'';
  return {definitions:`<defs><filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">${transfer}<feColorMatrix type="saturate" values="${1+f.saturation/100}"/><feColorMatrix type="hueRotate" values="${f.hue}"/>${warm}${effect}${tint}</filter></defs>`,reference:` filter="url(#${id})"`};
}
