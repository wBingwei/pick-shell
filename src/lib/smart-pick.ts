/**
 * 手动选区（Smart Pick）
 *
 * 交互原则：页面上不放任何可点击按钮。
 * 鼠标只负责「指向」，所有控制都交给键盘快捷键——否则为了点按钮移动鼠标时，
 * 指针下的 DOM 元素会跟着变，选区就跑了。
 *
 * 快捷键：↑/← 选父级、↓/→ 选子级、空格 连选、Enter 完成采集、Esc 退出。
 * 同一套说明会同时出现在页面底部的悬浮提示条和侧边栏「手动选区」面板里。
 */

let isPickMode = false
let isMultiPick = false
let hoveredElement: HTMLElement | null = null

let overlay: HTMLDivElement | null = null
let highlightBox: HTMLDivElement | null = null
let labelTag: HTMLDivElement | null = null
let markedLayer: HTMLDivElement | null = null
let hintBar: HTMLDivElement | null = null

const selectedElements: HTMLElement[] = []
const markBoxes: HTMLDivElement[] = []

/** 侧边栏与页面共用的一份按键说明 */
const KEY_HINTS: Array<{ keys: string[]; text: string }> = [
  { keys: ["↑", "←"], text: "选父级" },
  { keys: ["↓", "→"], text: "选子级" },
  { keys: ["空格"], text: "连选" },
  { keys: ["Enter"], text: "采集" },
  { keys: ["Esc"], text: "退出" }
]

function ownNodes() {
  return [overlay, highlightBox, markedLayer, hintBar].filter(Boolean) as HTMLElement[]
}

/** 判断节点（或其祖先）是否属于插件自己注入的 UI */
function isOwnNode(node: Node | null) {
  if (!node) return false
  return ownNodes().some((el) => el === node || el.contains(node))
}

function makeKeycap(text: string) {
  const kbd = document.createElement("kbd")
  kbd.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;" +
    "border-radius:4px;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.22);" +
    "font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#fff;"
  kbd.innerText = text
  return kbd
}

function makeHintItem(keys: string[], text: string) {
  const item = document.createElement("span")
  item.style.cssText = "display:inline-flex;align-items:center;gap:4px;white-space:nowrap;"
  keys.forEach((key) => item.appendChild(makeKeycap(key)))
  const label = document.createElement("span")
  label.innerText = text
  label.style.cssText = "margin-left:2px;color:rgba(248,250,252,0.88);"
  item.appendChild(label)
  return item
}

function buildHintBar() {
  hintBar = document.createElement("div")
  hintBar.style.cssText =
    "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);align-items:center;gap:14px;" +
    "max-width:calc(100vw - 32px);padding:9px 16px;border-radius:999px;background:rgba(15,23,42,0.92);" +
    "color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    "font-size:12px;box-shadow:0 10px 30px rgba(15,23,42,0.4);z-index:2147483646;" +
    "pointer-events:none;display:none;"

  const title = document.createElement("span")
  title.innerText = "手动选区"
  title.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;font-weight:700;color:#fff;white-space:nowrap;"
  const dot = document.createElement("i")
  dot.style.cssText = "width:6px;height:6px;border-radius:50%;background:#60a5fa;"
  title.prepend(dot)
  hintBar.appendChild(title)

  const sep = document.createElement("i")
  sep.style.cssText = "width:1px;height:14px;background:rgba(255,255,255,0.22);"
  hintBar.appendChild(sep)

  KEY_HINTS.forEach((hint) => hintBar!.appendChild(makeHintItem(hint.keys, hint.text)))
}

function getUI() {
  if (highlightBox) return

  overlay = document.createElement("div")
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);" +
    "z-index:999998;pointer-events:none;display:none;"
  document.body.appendChild(overlay)

  markedLayer = document.createElement("div")
  markedLayer.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:999998;pointer-events:none;"
  document.body.appendChild(markedLayer)

  highlightBox = document.createElement("div")
  highlightBox.style.cssText =
    "position:absolute;border:2px solid #1a73e8;background:rgba(26,115,232,0.1);z-index:999999;" +
    "pointer-events:none;display:none;transition:all 0.1s ease;box-shadow:0 0 8px rgba(26,115,232,0.5);"
  document.body.appendChild(highlightBox)

  labelTag = document.createElement("div")
  labelTag.style.cssText =
    "position:absolute;top:-25px;left:0;background:#1a73e8;color:white;padding:2px 8px;font-size:12px;" +
    "border-radius:4px;white-space:nowrap;font-family:-apple-system,BlinkMacSystemFont,sans-serif;"
  highlightBox.appendChild(labelTag)

  buildHintBar()
  document.body.appendChild(hintBar!)
}

function updateLabel() {
  if (!labelTag || !hoveredElement) return
  const rect = hoveredElement.getBoundingClientRect()
  const count = isMultiPick && selectedElements.length > 0 ? ` · 已连选 ${selectedElements.length} 段` : ""
  labelTag.innerText = `${hoveredElement.tagName.toLowerCase()} | ${Math.round(rect.width)}x${Math.round(rect.height)}${count}`
}

function placeBox(box: HTMLElement, rect: DOMRect) {
  box.style.top = `${rect.top + window.scrollY}px`
  box.style.left = `${rect.left + window.scrollX}px`
  box.style.width = `${rect.width}px`
  box.style.height = `${rect.height}px`
}

function positionMarks() {
  selectedElements.forEach((el, index) => {
    const box = markBoxes[index]
    if (box) placeBox(box, el.getBoundingClientRect())
  })
}

/** 重绘「连选」的虚线框，让用户看到自己都选了哪些片段 */
function renderMarks() {
  if (!markedLayer) return
  markedLayer.innerHTML = ""
  markBoxes.length = 0
  selectedElements.forEach(() => {
    const box = document.createElement("div")
    box.style.cssText =
      "position:absolute;border:2px dashed #a855f7;background:rgba(168,85,247,0.08);border-radius:2px;"
    markedLayer!.appendChild(box)
    markBoxes.push(box)
  })
  positionMarks()
}

function updateHighlight(el: HTMLElement) {
  if (!highlightBox || !overlay || !labelTag) return
  if (isOwnNode(el)) return

  hoveredElement = el
  placeBox(highlightBox, el.getBoundingClientRect())
  highlightBox.style.display = "block"
  overlay.style.display = "block"
  updateLabel()
}

function handleMouseMove(e: MouseEvent) {
  if (!isPickMode) return

  if (isOwnNode(document.elementFromPoint(e.clientX, e.clientY))) return

  const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  if (target && target !== hoveredElement) updateHighlight(target)
}

function handleScrollOrResize() {
  if (!isPickMode || !hoveredElement) return
  placeBox(highlightBox!, hoveredElement.getBoundingClientRect())
  positionMarks()
}

function handleClick(e: MouseEvent) {
  if (!isPickMode) return
  if (isOwnNode(e.target as Node)) return
  // 选区模式下点击只当作「确认指向」，不要触发链接跳转
  e.preventDefault()
  e.stopPropagation()
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isPickMode) return
  if (!handlePickKey(e.key)) return
  e.preventDefault()
  e.stopPropagation()
}

function selectParent() {
  const parent = hoveredElement?.parentElement
  if (!parent || parent === document.documentElement) return
  updateHighlight(parent)
}

function selectChild() {
  const child = hoveredElement?.firstElementChild
  if (child) updateHighlight(child as HTMLElement)
}

/** 空格：把当前元素加入 / 移出「连选」 */
function toggleMultiPick() {
  if (!hoveredElement) return
  const index = selectedElements.indexOf(hoveredElement)
  if (index >= 0) {
    selectedElements.splice(index, 1)
    if (selectedElements.length === 0) isMultiPick = false
  } else {
    isMultiPick = true
    selectedElements.push(hoveredElement)
  }
  renderMarks()
  updateLabel()
}

/**
 * 统一处理按键。页面自身的 keydown 与侧边栏转发过来的按键都走这里。
 * @returns 是否消费了该按键
 */
export function handlePickKey(key: string): boolean {
  if (!isPickMode) return false

  switch (key) {
    case "Escape":
      cancelPickMode()
      return true
    case "Enter":
      finishSelection()
      return true
    case " ":
    case "Spacebar":
      toggleMultiPick()
      return true
    case "ArrowUp":
    case "ArrowLeft":
      selectParent()
      return true
    case "ArrowDown":
    case "ArrowRight":
      selectChild()
      return true
    default:
      return false
  }
}

export function enterPickMode() {
  isPickMode = true
  getUI()
  selectedElements.length = 0
  markBoxes.length = 0
  isMultiPick = false
  hoveredElement = null
  if (highlightBox) highlightBox.style.display = "none"
  if (overlay) overlay.style.display = "none"
  if (markedLayer) markedLayer.innerHTML = ""
  if (hintBar) hintBar.style.display = "flex"

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
  if (hintBar) hintBar.style.display = "none"
  if (markedLayer) markedLayer.innerHTML = ""
  markBoxes.length = 0
  hoveredElement = null

  document.removeEventListener("mousemove", handleMouseMove, true)
  document.removeEventListener("keydown", handleKeyDown, true)
  document.removeEventListener("click", handleClick, true)
  window.removeEventListener("scroll", handleScrollOrResize, true)
  window.removeEventListener("resize", handleScrollOrResize, true)
  document.body.style.userSelect = ""
  document.body.style.cursor = ""
}

/** Esc 退出：除了清理页面 UI，还要通知侧边栏把「采集方式」切回整页提取 */
function cancelPickMode() {
  exitPickMode()
  chrome.runtime.sendMessage({ type: "PICK_EXIT" }).catch(() => {})
}

type NoticeType = "info" | "success" | "warn" | "error"

// 与侧边栏提示同一套语义配色：进行中=蓝、成功=绿、警告=琥珀、失败=红
const NOTICE_THEME: Record<NoticeType, { bg: string; fg: string; icon: string; badge: string }> = {
  info: { bg: "#2563eb", fg: "#ffffff", icon: "i", badge: "rgba(255,255,255,0.22)" },
  success: { bg: "#059669", fg: "#ffffff", icon: "✓", badge: "rgba(255,255,255,0.22)" },
  warn: { bg: "#f59e0b", fg: "#3f2a06", icon: "!", badge: "rgba(63,42,6,0.16)" },
  error: { bg: "#dc2626", fg: "#ffffff", icon: "✕", badge: "rgba(255,255,255,0.22)" }
}

function showNotice(text: string, type: NoticeType = "info") {
  const theme = NOTICE_THEME[type]
  const notice = document.createElement("div")
  const style = document.createElement("style")
  style.textContent = `
    @keyframes shell-picker-fadeInDown {
      from { opacity: 0; transform: translate(-50%, -20px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    @keyframes shell-picker-fadeOutUp {
      from { opacity: 1; transform: translate(-50%, 0); }
      to { opacity: 0; transform: translate(-50%, -20px); }
    }
  `
  document.head.appendChild(style)

  notice.style.cssText =
    `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:${theme.bg};color:${theme.fg};` +
    "display:flex;align-items:center;gap:8px;" +
    "padding:10px 20px 10px 12px;border-radius:30px;z-index:1000001;" +
    "box-shadow:0 6px 20px rgba(0,0,0,0.24);font-weight:600;font-size:14px;line-height:1.2;" +
    "animation:shell-picker-fadeInDown 0.3s ease;pointer-events:none;" +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'

  const badge = document.createElement("span")
  badge.style.cssText =
    `flex:none;width:18px;height:18px;border-radius:50%;background:${theme.badge};` +
    "display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;"
  badge.textContent = theme.icon
  notice.appendChild(badge)
  notice.appendChild(document.createTextNode(text))
  document.body.appendChild(notice)

  setTimeout(() => {
    notice.style.animation = "shell-picker-fadeOutUp 0.3s ease"
    setTimeout(() => {
      notice.remove()
      style.remove()
    }, 300)
  }, 3000)
}

async function finishSelection() {
  if (!hoveredElement) return

  const title = document.title
  const url = location.href

  let content = ""
  let segmentCount = 1

  if (isMultiPick && selectedElements.length > 0) {
    // 去掉被其它已选元素包含的嵌套元素，避免同一段内容重复采集
    const picks = selectedElements.filter(
      (el) => !selectedElements.some((other) => other !== el && other.contains(el))
    )
    segmentCount = picks.length
    content = picks.map((el) => el.outerHTML).join("\n")
  } else {
    content = hoveredElement.outerHTML
  }

  exitPickMode()

  showNotice(`已加入暂存（${segmentCount} 个片段）`, "success")

  chrome.runtime.sendMessage({
    type: "PICK_COMPLETE",
    payload: { content, title: `${title} (片段)`, url }
  })
}
