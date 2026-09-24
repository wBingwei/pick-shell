import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  BASKET_KEY,
  getBasket,
  setBasket,
  openEditor,
  takeEditJob,
  saveClipMarkdown,
  notifyBasketUpdated,
  type Clip
} from "../lib/basket"

beforeEach(() => {
  vi.clearAllMocks()
  // storage mock 用内存实现，每次测完清空
})

describe("getBasket / setBasket", () => {
  it("setBasket 写入后 getBasket 读回", async () => {
    const clips: Clip[] = [
      { id: "a", content: "<p>A</p>", markdown: "A" },
      { id: "b", content: "<p>B</p>", markdown: "B" }
    ]
    await setBasket(clips)
    const got = await getBasket()
    expect(got).toEqual(clips)
  })

  it("storage 为空时 getBasket 返回空数组", async () => {
    const got = await getBasket()
    expect(got).toEqual([])
  })

  it("storage 存的不是数组时 getBasket 返回空数组", async () => {
    ;(chrome.storage.local.get as any).mockImplementationOnce(() =>
      Promise.resolve({ [BASKET_KEY]: { foo: "bar" } })
    )
    const got = await getBasket()
    expect(got).toEqual([])
  })
})

describe("takeEditJob", () => {
  it("有 job 时读出并删除", async () => {
    const job = { id: "x", title: "T", url: "https://example.com", markdown: "# Hello" }
    ;(chrome.storage.local.get as any).mockImplementationOnce(() =>
      Promise.resolve({ editJob: job })
    )
    const result = await takeEditJob()
    expect(result).toEqual(job)
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("editJob")
  })

  it("无 job 时返回 null", async () => {
    const result = await takeEditJob()
    expect(result).toBeNull()
  })
})

describe("saveClipMarkdown", () => {
  it("把 Markdown 转换为 HTML 并更新对应片段", async () => {
    const initial: Clip[] = [
      { id: "a", content: "<p>old</p>", markdown: "old" },
      { id: "b", content: "<p>keep</p>", markdown: "keep" }
    ]
    ;(chrome.storage.local.get as any).mockImplementationOnce(() =>
      Promise.resolve({ [BASKET_KEY]: initial })
    )

    const result = await saveClipMarkdown("a", "# New Title")
    const updated = result.find((c) => c.id === "a")!
    expect(updated.markdown).toBe("# New Title")
    // content 是 markdownToHtml 的结果，至少应该包含 h1 标签
    expect(updated.content).toContain("<h1>")
    // 未更新的片段保持不变
    expect(result.find((c) => c.id === "b")!.content).toBe("<p>keep</p>")
    // 最终写回 storage
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1)
  })

  it("id 不存在时保持原样", async () => {
    const initial: Clip[] = [{ id: "a", content: "<p>x</p>", markdown: "x" }]
    ;(chrome.storage.local.get as any).mockImplementationOnce(() =>
      Promise.resolve({ [BASKET_KEY]: initial })
    )
    const result = await saveClipMarkdown("not-exist", "# New")
    expect(result).toEqual(initial)
  })
})

describe("openEditor", () => {
  const clip: Clip = {
    id: "c1",
    content: "<p>html</p>",
    markdown: "# Hi",
    title: "标题",
    url: "https://example.com/post"
  }

  it("写入 editJob、打开 popup 窗口并最大化", async () => {
    await openEditor(clip)

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      editJob: { id: "c1", title: "标题", url: "https://example.com/post", markdown: "# Hi" }
    })
    expect(chrome.windows.create).toHaveBeenCalledTimes(1)
    const args = (chrome.windows.create as any).mock.calls[0][0]
    expect(args.type).toBe("popup")
    expect(args.url).toContain("tabs/editor.html")
    expect(chrome.windows.update).toHaveBeenCalledWith(1, { state: "maximized" })
  })

  it("窗口没有 id 时跳过最大化，不抛错", async () => {
    ;(chrome.windows.create as any).mockResolvedValueOnce({})
    await expect(openEditor(clip)).resolves.toEqual({})
    expect(chrome.windows.update).not.toHaveBeenCalled()
  })

  it("最大化失败被静默吞掉（窗口仍可用于编辑）", async () => {
    ;(chrome.windows.update as any).mockRejectedValueOnce(new Error("boom"))
    await expect(openEditor(clip)).resolves.toBeDefined()
  })
})

describe("notifyBasketUpdated", () => {
  it("发送 BASKET_UPDATED 消息", async () => {
    await notifyBasketUpdated()
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "BASKET_UPDATED" })
  })

  it("sendMessage 抛错时静默（侧边栏没开的正常情况）", async () => {
    ;(chrome.runtime.sendMessage as any).mockRejectedValueOnce(new Error("no receiver"))
    // 不抛错就算过
    await expect(notifyBasketUpdated()).resolves.not.toThrow()
  })
})
