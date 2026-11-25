// Only known player URLs and direct media files become embeds. Never accept
// arbitrary iframe HTML, script URLs, or provider-supplied markup.
export const videoFrameSources = 'https://www.youtube.com https://player.vimeo.com';
const time = value => {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Math.min(86400, Number(value));
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  return parts ? Math.min(86400, Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0)) : 0;
};
export function videoSource(input) {
  if (typeof input !== 'string' || input.length > 4096) return null;
  let url;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase(), path = url.pathname;
  if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com','youtu.be','www.youtu.be'].includes(host)) {
    const short = /^\/shorts\/([\w-]{11})\/?$/.exec(path);
    const id = host.endsWith('youtu.be') ? /^\/([\w-]{11})\/?$/.exec(path)?.[1]
      : path === '/watch' ? url.searchParams.get('v') : (short || /^\/(?:embed|live)\/([\w-]{11})\/?$/.exec(path))?.[1];
    if (!/^[\w-]{11}$/.test(id || '')) return null;
    const start = time(url.searchParams.get('start') || url.searchParams.get('t') || new URLSearchParams(url.hash.slice(1)).get('t'));
    return { provider:'youtube', id, start, ratio:short ? 'portrait' : 'wide', url:`https://www.youtube.com/${short ? 'shorts/' + id : 'watch?v=' + id}${start ? (short ? '?' : '&') + 't=' + start : ''}`, poster:`https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  }
  if (['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)) {
    const match = /^(?:\/video|\/channels\/[^/]+|\/groups\/[^/]+\/videos)?\/(\d{1,12})(?:\/([a-f\d]{6,64}))?\/?$/i.exec(path);
    if (!match) return null;
    const hash = match[2] || url.searchParams.get('h');
    if (hash && !/^[a-f\d]{6,64}$/i.test(hash)) return null;
    const start = time(new URLSearchParams(url.hash.slice(1)).get('t'));
    return { provider:'vimeo', id:match[1], hash:hash || '', start, ratio:'wide', url:`https://vimeo.com/${match[1]}${hash ? '/' + hash : ''}${start ? '#t=' + start + 's' : ''}` };
  }
  if (/\.(mp4|webm|ogv|ogg|m4v)$/i.test(path)) return { provider:'file', url:url.href, ratio:'wide', start:0 };
  return null;
}
export function videoFrameURL(source, origin) {
  if (source.provider === 'file') return source.url;
  // Use the normal player origin so the browser can supply the viewer's existing
  // YouTube session. The separate nocookie origin cannot use that same session.
  const url = new URL(source.provider === 'youtube' ? `https://www.youtube.com/embed/${source.id}` : `https://player.vimeo.com/video/${source.id}`);
  const params = source.provider === 'youtube'
    ? {
        autoplay:'1', playsinline:'1', controls:'0', fs:'0', rel:'0', color:'white', iv_load_policy:'3',
        ...(source.start ? {start:String(source.start)} : {}),
      }
    : { autoplay:'1', playsinline:'1', title:'0', byline:'0', portrait:'0', badge:'0', dnt:'1', ...(source.hash ? {h:source.hash} : {}) };
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  if (source.provider === 'youtube' && /^https?:\/\//.test(origin || '')) url.searchParams.set('origin',new URL(origin).origin);
  if (source.provider === 'vimeo' && source.start) url.hash = 't=' + source.start + 's';
  return url.href;
}
