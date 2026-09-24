import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { enterPickMode, exitPickMode, handlePickKey } from "../lib/smart-pick"

beforeEach(() => {
  // cancelPickMode / finishSelection 都依赖 sendMessage 返回 Promise
  ;(chrome.runtime.sendMessage as any).mockResolvedValue({})
})

afterEach(() => {
  exitPickMode()
  document.body.innerHTML = ""
  // jsdom 未实现 elementFromPoint，测试里是直接赋值的
  if ("elementFromPoint" in document) delete (document as any).elementFromPoint
})

describe("smart-pick 按键状态机", () => {
  it("未进入选区模式时所有按键都不消费", () => {
    expect(handlePickKey("Escape")).toBe(false)
    expect(handlePickKey("Enter")).toBe(false)
    expect(handlePickKey("ArrowUp")).toBe(false)
    expect(handlePickKey(" ")).toBe(false)
  })

  it("enterPickMode 改变光标与选中样式，exitPickMode 还原", () => {
    enterPickMode()
    expect(document.body.style.cursor).toBe("crosshair")
    expect(document.body.style.userSelect).toBe("none")

    exitPickMode()
    expect(document.body.style.cursor).toBe("")
    expect(document.body.style.userSelect).toBe("")
  })

  it("选区模式下方向键/空格/回车都被消费，未知按键不消费", () => {
    enterPickMode()
    expect(handlePickKey("ArrowUp")).toBe(true)
    expect(handlePickKey("ArrowLeft")).toBe(true)
    expect(handlePickKey("ArrowDown")).toBe(true)
    expect(handlePickKey("ArrowRight")).toBe(true)
    expect(handlePickKey(" ")).toBe(true)
    expect(handlePickKey("Spacebar")).toBe(true)
    expect(handlePickKey("Enter")).toBe(true)
    expect(handlePickKey("a")).toBe(false)
  })

  it("Esc 退出并广播 PICK_EXIT 通知侧边栏", () => {
    enterPickMode()
    const handled = handlePickKey("Escape")
    expect(handled).toBe(true)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "PICK_EXIT" })
  })

  it("完整连选流程：指向元素 → 空格连选 → 回车采集 PICK_COMPLETE", () => {
    document.title = "目标页面"
    const target = document.createElement("div")
    target.id = "pick-target"
    target.textContent = "选中的内容"
    document.body.appendChild(target)

    // jsdom 未实现该 API，直接挂桩
    ;(document as any).elementFromPoint = vi.fn(() => target)

    enterPickMode()

    // 页面内真实派发 mousemove，让 hoveredElement 指向目标
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 10 }))

    expect(handlePickKey(" ")).toBe(true) // 连选
    expect(handlePickKey("Enter")).toBe(true) // 采集

    const call = (chrome.runtime.sendMessage as any).mock.calls.find(
      (c: any[]) => c[0]?.type === "PICK_COMPLETE"
    )
    expect(call).toBeDefined()
    const payload = call[0].payload
    expect(payload.content).toContain('id="pick-target"')
    expect(payload.content).toContain("选中的内容")
    expect(payload.title).toContain("(片段)")
    expect(typeof payload.url).toBe("string")
  })
})
