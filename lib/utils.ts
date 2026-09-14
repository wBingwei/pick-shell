export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

export function getElementSelectorPath(el: HTMLElement) {
  if (el.id) return `#${cssEscape(el.id)}`
  const parts: string[] = []
  let current: HTMLElement | null = el
  while (current && current.nodeType === 1 && current !== document.body) {
    const tag = current.tagName.toLowerCase()
    const parent = current.parentElement
    if (!parent) break
    const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName)
    const index = siblings.indexOf(current) + 1
    parts.unshift(`${tag}:nth-of-type(${index})`)
    current = parent
  }
  return parts.join(" > ")
}

export function isScrollable(el: HTMLElement) {
  const style = window.getComputedStyle(el)
  const overflowY = style.overflowY
  const canScroll = (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 20
  return canScroll
}

export function simpleHash(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return hash.toString(16)
}
