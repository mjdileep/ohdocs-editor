import icons from './.build/icons.json' with { type: 'json' }

const groupOutline = `<svg class="fn-group-outline" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6.5 6c-2.2-1.3-4.1.5-4.1 3.2 0 2.1 1.3 3.5 3 3.5.4 0 .8-.1 1.1-.2M5.4 12.7C2.8 12.7 1 15.1 1 18v.9h4.5"/>
  <path d="M17.5 6c2.2-1.3 4.1.5 4.1 3.2 0 2.1-1.3 3.5-3 3.5-.4 0-.8-.1-1.1-.2m1.1.2c2.6 0 4.4 2.4 4.4 5.3v.9h-4.5"/>
  <ellipse cx="12" cy="8.6" rx="3.3" ry="4.2"/>
  <path d="M12 12.8c-3.6 0-6.5 3.3-6.5 7.2v1.5h13V20c0-3.9-2.9-7.2-6.5-7.2Z"/>
</svg>`

export const icon = name => name === 'group-outline' ? groupOutline : (icons[name] ?? '')

export function hydrateIcons(container = document) {
  container.querySelectorAll('i[data-lucide]').forEach(el => {
    const svg = icon(el.dataset.lucide)
    if (!svg) return
    const placeholderClasses = Array.from(el.classList)
    const template = document.createElement('template')
    template.innerHTML = svg
    const element = template.content.firstElementChild
    element.classList.add(...placeholderClasses)
    el.replaceWith(element)
  })
}
