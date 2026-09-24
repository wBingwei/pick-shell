import { describe, it, expect, beforeAll, afterEach, vi } from "vitest"
import "../background"

let onInstalled: () => void
let onContextMenuClick: (info: any, tab: any) => void
let onMessage: (request: any, sender: any, sendResponse: any) => boolean | undefined

beforeAll(() => {
  onInstalled = (chrome.runtime.onInstalled.addListener as any).mock.calls[0][0]
  onContextMenuClick = (chrome.contextMenus.onClicked.addListener as any).mock.calls[0][0]
  onMessage = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0]
})

afterEach(() => {
  vi.restoreAllMocks()
})

// 等 FileReader 的异步回调落定
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

describe("background onInstalled", () => {
  it("设置侧边栏点击行为并创建选中区域右键菜单", () => {
    onInstalled()

    expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true
    })
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "extract-selection",
        contexts: ["selection"]
      })
    )
  })
})

describe("background 右键菜单", () => {
  it("点击 extract-selection 时向标签页发 PICK_COMPLETE_DIRECT", async () => {
    onContextMenuClick(
      { menuItemId: "extract-selection", selectionText: "被选中的文字" },
      { id: 11, url: "https://example.com/a", title: "示例页" }
    )
    // sendTabMessage 是 async，等一帧
    await tick()

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        type: "PICK_COMPLETE_DIRECT",
        payload: expect.objectContaining({
          title: "示例页 (右键片段)"
        })
      })
    )
  })

  it("其他菜单项 id 不处理", async () => {
    onContextMenuClick({ menuItemId: "other" }, { id: 12 })
    await tick()
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled()
  })
})

describe("background FETCH_IMAGE_BLOB", () => {
  it("跨域取图成功后回传 data URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      blob: async () => new Blob(["fake-bytes"], { type: "image/png" })
    } as Response)

    const sendResponse = vi.fn()
    const keepOpen = onMessage({ type: "FETCH_IMAGE_BLOB", url: "https://img.test/a.png" }, {}, sendResponse)
    expect(keepOpen).toBe(true)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled(), { timeout: 2000 })
    const res = sendResponse.mock.calls[0][0]
    expect(res.data).toEqual(expect.stringMatching(/^data:image\/png;base64,/))
  })

  it("fetch 失败时回传 error 字段", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("CORS blocked"))

    const sendResponse = vi.fn()
    onMessage({ type: "FETCH_IMAGE_BLOB", url: "https://img.test/b.png" }, {}, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled(), { timeout: 2000 })
    expect(sendResponse.mock.calls[0][0].error).toContain("CORS blocked")
  })
})
