/**
 * Markdown-lite renderer. Builds DOM nodes directly — innerHTML never touches
 * user text. Supports: #/##/### headings, - lists, **bold**, *italic*,
 * blank-line paragraphs, and plain text everywhere else. Links and images are
 * deliberately NOT supported (safety) — https text stays text.
 */

export interface LiteRendered {
  root: HTMLElement | null
  /** Rough word count reused for stats. */
  words: number
}

export function renderMarkdownLite(
  text: string,
  styles?: { h?: string; p?: string; li?: string; b?: string; i?: string },
  doc: Document = document,
): LiteRendered {
  const root = doc.createElement('div')
  const blocks = text.split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n')
    let list: HTMLUListElement | null = null
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed)
      if (heading) {
        const h = doc.createElement('h4')
        h.textContent = heading[2]
        if (styles?.h) h.className = styles.h
        root.appendChild(h)
        continue
      }
      if (/^-+\s+/.test(trimmed)) {
        if (!list) {
          list = doc.createElement('ul')
          root.appendChild(list)
        }
        const li = doc.createElement('li')
        li.textContent = trimmed.replace(/^-+\s+/, '') || ' '
        if (styles?.li) li.className = styles.li
        list.appendChild(li)
        continue
      }
      list = null
      const p = doc.createElement('p')
      p.textContent = trimmed || ' '
      if (styles?.p) p.className = styles.p
      root.appendChild(p)
    }
  }

  // Bold/italic rewrite pass on the assembled tree's text nodes.
  applyInline(root)
  return { root, words: countWords(text) }
}

function countWords(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

function applyInline(root: HTMLElement): void {
  for (const p of Array.from(root.querySelectorAll<HTMLElement>('p, li, h4'))) {
    p.innerHTML = '' // clear originals, rebuild safely
    const src = p.textContent ?? ''
    appendInline(p, src)
  }
}

function appendInline(target: HTMLElement, src: string): void {
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/
  let rest = src
  for (;;) {
    const m = pattern.exec(rest)
    if (!m || m.index === undefined) break
    if (m.index > 0) target.appendChild(doc.createTextNode(rest.slice(0, m.index)))
    if (m[2] !== undefined) {
      const strong = doc.createElement('strong')
      strong.textContent = m[2]
      target.appendChild(strong)
    } else if (m[3] !== undefined) {
      const em = doc.createElement('em')
      em.textContent = m[3]
      target.appendChild(em)
    }
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) target.appendChild(doc.createTextNode(rest))
}

const doc: Document = document
