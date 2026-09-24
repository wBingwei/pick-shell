import { describe, it, expect, beforeAll, afterEach, vi } from "vitest"
// 导入即注册 onMessage 监听
import "../content"

let handler: (request: any, sender: any, sendResponse: any) => boolean | undefined

beforeAll(() => {
  const calls = (chrome.runtime.onMessage.addListener as any).mock.calls
  handler = calls[0][0]
})

afterEach(() => {
  // 退出可能开启的选区模式
  handler({ type: "EXIT_PICK_MODE" }, {}, vi.fn())
  document.body.innerHTML = ""
  document.title = ""
})

function dispatch(request: any) {
  const sendResponse = vi.fn()
  const keepChannelOpen = handler(request, {}, sendResponse)
  return { sendResponse, keepChannelOpen }
}

// 等内容脚本里的 Promise 链落定
async function settled() {
  await vi.waitFor(() => {})
}

describe("content.ts 消息路由", () => {
  it("未知消息类型返回 false（不保持端口）", () => {
    const { keepChannelOpen } = dispatch({ type: "UNKNOWN_X" })
    expect(keepChannelOpen).toBe(false)
  })

  it("DETECT_VIRTUAL_LIST 同步返回 true 并响应 exists 布尔值", async () => {
    const { sendResponse, keepChannelOpen } = dispatch({ type: "DETECT_VIRTUAL_LIST" })
    expect(keepChannelOpen).toBe(true)
    await settled()
    expect(sendResponse).toHaveBeenCalledWith({ exists: expect.any(Boolean) })
  })

  it("ENTER_PICK_MODE / EXIT_PICK_MODE 返回 success", () => {
    const enter = dispatch({ type: "ENTER_PICK_MODE" })
    expect(enter.keepChannelOpen).toBe(true)
    expect(enter.sendResponse).toHaveBeenCalledWith({ success: true })

    const exit = dispatch({ type: "EXIT_PICK_MODE" })
    expect(exit.sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("未进入选区时 PICK_KEY 返回 handled:false", () => {
    const { sendResponse } = dispatch({ type: "PICK_KEY", key: "Enter" })
    expect(sendResponse).toHaveBeenCalledWith({ handled: false })
  })

  it("PICK_COMPLETE_DIRECT 转发为 PICK_COMPLETE", () => {
    const payload = { content: "<p>x</p>", title: "t" }
    const { sendResponse } = dispatch({ type: "PICK_COMPLETE_DIRECT", payload })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "PICK_COMPLETE", payload })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("PROCESS_IMAGES 处理无图片 HTML 并原样返回", async () => {
    const { sendResponse } = dispatch({ type: "PROCESS_IMAGES", html: "<div><p>no images here</p></div>" })
    await settled()
    const arg = sendResponse.mock.calls[0][0]
    expect(arg.html).toContain("no images here")
  })

  it("EXTRACT_CONTENT 返回 title 与 content", async () => {
    document.title = "代码页"
    document.body.innerHTML = "<pre>const x = 1</pre>"

    const { sendResponse, keepChannelOpen } = dispatch({
      type: "EXTRACT_CONTENT",
      format: "markdown",
      deepCapture: false
    })
    expect(keepChannelOpen).toBe(true)

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled()
    })
    const res = sendResponse.mock.calls[0][0]
    expect(res.title).toBe("代码页")
    expect(res.content).toContain("<pre>")
    expect(res).not.toHaveProperty("error")
  })
})
