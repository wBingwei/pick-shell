import { getElementSelectorPath } from "./utils"

let isPickMode = false
let hoveredElement: HTMLElement | null = null
let lockedElement: HTMLElement | null = null
let highlightBox: HTMLDivElement | null = null
let labelTag: HTMLDivElement | null = null
let toolbar: HTMLDivElement | null = null
let overlay: HTMLDivElement | null = null
let isMultiPick = false
const selectedElements: HTMLElement[] = []
let currentRect: DOMRect | null = null

function getUI() {
  if (!highlightBox) {
    overlay = document.createElement("div")
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:999998;pointer-events:none;display:none;"
    document.body.appendChild(overlay)

    highlightBox = document.createElement("div")
    highlightBox.style.cssText = "position:absolute;border:2px solid #1a73e8;background:rgba(26,115,232,0.1);z-index:999999;pointer-events:none;display:none;transition:all 0.1s ease;box-shadow:0 0 8px rgba(26,115,232,0.5);"
    document.body.appendChild(highlightBox)

    labelTag = document.createElement("div")
    labelTag.style.cssText = "position:absolute;top:-25px;left:0;background:#1a73e8;color:white;padding:2px 8px;font-size:12px;border-radius:4px;white-space:nowrap;"
    highlightBox.appendChild(labelTag)

    toolbar = document.createElement("div")
    toolbar.style.cssText = "position:absolute;background:white;border:1px solid #ddd;border-radius:6px;display:flex;padding:4px;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:1000000;"
    toolbar.innerHTML = `
      <button id="fp-up" style="padding:2px 8px;cursor:pointer;border:1px solid #eee;background:#fff;">↑ 父级</button>
      <button id="fp-down" style="padding:2px 8px;cursor:pointer;border:1px solid #eee;background:#fff;">↓ 子级</button>
      <button id="fp-multi" style="padding:2px 8px;cursor:pointer;border:1px solid #eee;background:#fff;">+ 连选</button>
      <button id="fp-ok" style="padding:2px 8px;cursor:pointer;background:#1a73e8;color:#fff;border:none;font-weight:bold;">√ 完成选择</button>
      <button id="fp-cancel" style="padding:2px 8px;cursor:pointer;background:#eee;border:none;">取消</button>
    `
    document.body.appendChild(toolbar)

    toolbar.querySelector("#fp-up")?.addEventListener("click", (e) => {
      e.stopPropagation()
      if (hoveredElement?.parentElement) updateHighlight(hoveredElement.parentElement)
    })

    toolbar.querySelector("#fp-down")?.addEventListener("click", (e) => {
      e.stopPropagation()
      if (hoveredElement?.firstElementChild) updateHighlight(hoveredElement.firstElementChild as HTMLElement)
    })

    toolbar.querySelector("#fp-multi")?.addEventListener("click", (e) => {
      e.stopPropagation()
      if (!hoveredElement) return
      isMultiPick = true
      if (!selectedElements.includes(hoveredElement)) selectedElements.push(hoveredElement)
      updateLabel()
    })

    toolbar.querySelector("#fp-ok")?.addEventListener("click", (e) => {
      e.stopPropagation()
      finishSelection()
    })

    toolbar.querySelector("#fp-cancel")?.addEventListener("click", (e) => {
      e.stopPropagation()
      exitPickMode()
    })
  }
  return { highlightBox, labelTag, overlay, toolbar }
}

function updateLabel() {
  if (!labelTag || !hoveredElement) return
  const rect = hoveredElement.getBoundingClientRect()
  const count = isMultiPick ? ` · 已选 ${selectedElements.length} 段` : ""
  labelTag.innerText = `${hoveredElement.tagName.toLowerCase()} | ${Math.round(rect.width)}x${Math.round(rect.height)}${count}`
}

function positionToolbar(rect: DOMRect) {
  if (!toolbar) return
  const vh = window.innerHeight
  const vw = window.innerWidth
  const padding = 12

  toolbar.style.position = "fixed"
  toolbar.style.display = "flex"
  toolbar.style.visibility = "hidden"

  const tbRect = toolbar.getBoundingClientRect()
  const tbHeight = tbRect.height || 38
  const tbWidth = tbRect.width || 280

  let topPos = rect.bottom - tbHeight - padding
  topPos = Math.max(topPos, rect.top + padding)
  topPos = Math.min(topPos, vh - tbHeight - padding)

  let leftPos = rect.right - tbWidth - padding
  leftPos = Math.max(leftPos, rect.left + padding)
  leftPos = Math.min(leftPos, vw - tbWidth - padding)

  toolbar.style.top = `${topPos}px`
  toolbar.style.left = `${leftPos}px`
  toolbar.style.visibility = "visible"
  toolbar.style.background = "rgba(255, 255, 255, 0.95)"
  toolbar.style.backdropFilter = "blur(4px)"
}

function updateHighlight(el: HTMLElement) {
  if (!highlightBox || !overlay || !toolbar) return
  if (highlightBox.contains(el) || overlay.contains(el) || toolbar.contains(el)) return

  hoveredElement = el
  const rect = el.getBoundingClientRect()
  currentRect = rect
  const scrollY = window.scrollY
  const scrollX = window.scrollX

  highlightBox.style.top = `${rect.top + scrollY}px`
  highlightBox.style.left = `${rect.left + scrollX}px`
  highlightBox.style.width = `${rect.width}px`
  highlightBox.style.height = `${rect.height}px`
  highlightBox.style.display = "block"
  overlay.style.display = "block"

  positionToolbar(rect)
  updateLabel()
}

function handleMouseMove(e: MouseEvent) {
  if (!isPickMode) return

  if (toolbar && toolbar.contains(document.elementFromPoint(e.clientX, e.clientY))) return

  const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement
  
  if (target && target !== hoveredElement) {
    // 过滤掉我们自己的 UI 元素
    if (highlightBox?.contains(target) || overlay?.contains(target) || toolbar?.contains(target)) {
      return
    }
    updateHighlight(target)
  }
}

function handleScrollOrResize() {
  if (!isPickMode || !hoveredElement) return
  positionToolbar(hoveredElement.getBoundingClientRect())
}

function handleClick(e: MouseEvent) {
  if (!isPickMode) return
  if (toolbar && toolbar.contains(e.target as Node)) return
  if (highlightBox && highlightBox.contains(e.target as Node)) return
  const target = e.target as HTMLElement
  lockedElement = target
  updateHighlight(target)
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isPickMode) return
  if (e.key === "Escape") exitPickMode()
  if (e.key === "ArrowUp") {
    e.preventDefault()
    if (hoveredElement?.parentElement) updateHighlight(hoveredElement.parentElement)
  }
  if (e.key === "ArrowDown") {
    e.preventDefault()
    if (hoveredElement?.firstElementChild) updateHighlight(hoveredElement.firstElementChild as HTMLElement)
  }
}

export function enterPickMode() {
  isPickMode = true
  getUI()
  selectedElements.length = 0
  isMultiPick = false
  document.addEventListener("mousemove", handleMouseMove, true)
  document.addEventListener("keydown", handleKeyDown, true)
  document.addEventListener("click", handleClick, true)
  window.addEventListener("scroll", handleScrollOrResize, true)
  window.addEventListener("resize", handleScrollOrResize, true)
  document.body.style.userSelect = "none"
  document.body.style.cursor = "crosshair"
}

export function exitPickMode() {
  isPickMode = false
  if (highlightBox) highlightBox.style.display = "none"
  if (overlay) overlay.style.display = "none"
  if (toolbar) toolbar.style.display = "none"
  document.removeEventListener("mousemove", handleMouseMove, true)
  document.removeEventListener("keydown", handleKeyDown, true)
  document.removeEventListener("click", handleClick, true)
  window.removeEventListener("scroll", handleScrollOrResize, true)
  window.removeEventListener("resize", handleScrollOrResize, true)
  document.body.style.userSelect = ""
  document.body.style.cursor = ""
}

async function finishSelection() {
  if (!hoveredElement) return

  const title = document.title
  const url = location.href

  let content = ""
  let selectorPath: string | null = null
  if (isMultiPick && selectedElements.length > 0) {
    content = selectedElements.map((el) => el.outerHTML).join("\n")
  } else {
    content = hoveredElement.outerHTML
    selectorPath = getElementSelectorPath(hoveredElement)
  }

  exitPickMode()
  
  const notice = document.createElement("div")
  notice.id = "web-saver-notice"
  const style = document.createElement("style")
  style.textContent = `
    @keyframes web-saver-fadeInDown {
      from { opacity: 0; transform: translate(-50%, -20px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    @keyframes web-saver-fadeOutUp {
      from { opacity: 1; transform: translate(-50%, 0); }
      to { opacity: 0; transform: translate(-50%, -20px); }
    }
  `
  document.head.appendChild(style)
  
  notice.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a73e8;color:white;padding:12px 24px;border-radius:30px;z-index:1000001;box-shadow:0 4px 12px rgba(0,0,0,0.2);font-weight:bold;animation:web-saver-fadeInDown 0.3s ease;pointer-events:none;font-family:sans-serif;"
  notice.innerText = "✓ 啪嗒！我帮你装进口袋啦 (已加入暂存篮)"
  document.body.appendChild(notice)
  
  setTimeout(() => {
    notice.style.animation = "web-saver-fadeOutUp 0.3s ease"
    setTimeout(() => {
      notice.remove()
      style.remove()
    }, 300)
  }, 3000)

  chrome.runtime.sendMessage({
    type: "PICK_COMPLETE",
    payload: { content, title: `${title} (片段)`, url, selectorPath }
  })
}
