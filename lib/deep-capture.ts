import { isScrollable, simpleHash, sleep } from "./utils"
import { hydrateLazyImages } from "./image-processor"

export function getScrollableContainers(root: HTMLElement) {
  const result: HTMLElement[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node = walker.currentNode as HTMLElement
  while (node) {
    if (node instanceof HTMLElement && isScrollable(node)) result.push(node)
    node = walker.nextNode() as HTMLElement
  }
  return result
}

export function getBestScrollableContainer(root: HTMLElement) {
  const containers = getScrollableContainers(root)
  if (containers.length === 0) return null
  let best: HTMLElement | null = null
  let bestScore = 0
  for (const el of containers) {
    const rect = el.getBoundingClientRect()
    const area = Math.max(0, rect.width) * Math.max(0, rect.height)
    const score = area + el.scrollHeight
    if (score > bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

export function isSkeletonElement(el: HTMLElement) {
  const className = el.className || ""
  return typeof className === "string" && /skeleton|placeholder|shimmer|loading/i.test(className)
}

export function getCandidateItems(container: HTMLElement) {
  let items = Array.from(
    container.querySelectorAll(
      "[data-id],[data-index],[data-rowid],[role='listitem'],[role='row']"
    )
  ) as HTMLElement[]

  if (items.length === 0) {
    items = Array.from(container.children) as HTMLElement[]
  }

  return items.filter((el) => {
    if (!el || !el.tagName) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && !isSkeletonElement(el)
  })
}

export function isVirtualListContainer(container: HTMLElement) {
  if (!isScrollable(container)) return false
  const ratio = container.scrollHeight / Math.max(1, container.clientHeight)
  if (ratio < 2) return false

  const items = getCandidateItems(container)
  if (items.length === 0) return false

  const sampleHeights = items.slice(0, 10).map((el) => el.getBoundingClientRect().height).filter((h) => h > 0)
  const avgHeight = sampleHeights.length ? sampleHeights.reduce((a, b) => a + b, 0) / sampleHeights.length : 0
  const visibleCountEstimate = avgHeight ? Math.ceil(container.clientHeight / avgHeight) : items.length

  return items.length <= visibleCountEstimate * 3 || ratio >= 4
}

export function detectVirtualList(root: HTMLElement) {
  const containers = getScrollableContainers(root)
  return containers.some((c) => isVirtualListContainer(c))
}

export async function deepCaptureContainer(container: HTMLElement) {
  const buffer = new Map<string, string>()
  const order: string[] = []
  const originalScrollTop = container.scrollTop
  const maxSteps = 200
  const step = Math.max(100, Math.floor(container.clientHeight * 0.8))
  let lastScrollTop = -1
  let noNewCount = 0

  container.scrollTop = 0
  await sleep(300)

  for (let i = 0; i < maxSteps; i++) {
    hydrateLazyImages(container)
    const items = getCandidateItems(container)
    let added = 0

    items.forEach((item) => {
      if (!item || !item.tagName) return
      const dataKey = item.getAttribute("data-id") || item.getAttribute("data-index") || item.getAttribute("data-rowid")
      const text = (item.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120)
      const key = dataKey || simpleHash(`${text}-${item.offsetTop}-${item.tagName}`)
      if (!buffer.has(key)) {
        buffer.set(key, item.outerHTML)
        order.push(key)
        added++
      }
    })

    if (added === 0) {
      noNewCount += 1
    } else {
      noNewCount = 0
    }

    const nextScrollTop = Math.min(container.scrollTop + step, container.scrollHeight - container.clientHeight)
    if (nextScrollTop === container.scrollTop || nextScrollTop === lastScrollTop || noNewCount >= 3) break
    lastScrollTop = container.scrollTop
    container.scrollTop = nextScrollTop
    await sleep(350)
  }

  container.scrollTop = originalScrollTop
  if (order.length === 0) return ""
  return order.map((key) => buffer.get(key)).join("\n")
}
