import { describe, it, expect, beforeEach, vi } from "vitest"
import { sendTabMessage } from "../lib/messaging"

// 每个测试前重置 chrome mock（setup.ts 里 beforeEach 已做 resetAllMocks + 清空 storage）
// 这里只需要覆盖当前测试用到的 mock 行为

describe("sendTabMessage", () => {
  // injectContentScript 依赖 manifest.content_scripts，统一在这补上
  beforeEach(() => {
    ;(chrome.runtime.getManifest as any).mockReturnValue({
      content_scripts: [{ js: ["content.js"] }]
    })
  })

  it("正常路径直接返回 sendMessage 结果", async () => {
    ;(chrome.tabs.sendMessage as any).mockResolvedValueOnce({ ok: true })
    const result = await sendTabMessage(1, "https://example.com", { type: "PING" })
    expect(result).toEqual({ ok: true })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: "PING" })
  })

  it("'message port closed' 类错误直接抛出，不尝试注入", async () => {
    ;(chrome.tabs.sendMessage as any).mockRejectedValueOnce(
      new Error("Could not establish connection. Message port closed before a response was received.")
    )
    await expect(sendTabMessage(1, "https://example.com", {})).rejects.toThrow(/没有响应/)
    // 不应该去尝试注入
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })

  it("受限 URL + 'Receiving end does not exist' → 直接报错", async () => {
    ;(chrome.tabs.sendMessage as any).mockRejectedValueOnce(
      new Error("Could not establish connection. Receiving end does not exist.")
    )
    await expect(sendTabMessage(1, "chrome://settings", {})).rejects.toThrow(/不支持读取内容/)
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })

  it("非受限 URL + 无接收方 + 注入成功 → 重试成功", async () => {
    ;(chrome.tabs.sendMessage as any)
      .mockRejectedValueOnce(new Error("Receiving end does not exist."))
      .mockResolvedValueOnce({ retry: true })
    ;(chrome.scripting.executeScript as any).mockResolvedValueOnce([{}])

    const result = await sendTabMessage(1, "https://example.com", { type: "X" })
    expect(result).toEqual({ retry: true })
    // 第一次失败，注入后第二次成功
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2)
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
  })

  it("注入失败 → 抛刷新错误", async () => {
    ;(chrome.tabs.sendMessage as any).mockRejectedValueOnce(
      new Error("Receiving end does not exist.")
    )
    ;(chrome.scripting.executeScript as any).mockRejectedValueOnce(new Error("denied"))

    await expect(sendTabMessage(1, "https://example.com", {})).rejects.toThrow(/刷新页面后重试/)
  })

  it("注入成功但重试仍无接收方 → 抛刷新错误", async () => {
    ;(chrome.tabs.sendMessage as any)
      .mockRejectedValueOnce(new Error("Receiving end does not exist."))
      .mockRejectedValueOnce(new Error("Receiving end does not exist."))
    ;(chrome.scripting.executeScript as any).mockResolvedValueOnce([{}])

    await expect(sendTabMessage(1, "https://example.com", {})).rejects.toThrow(/刷新页面后重试/)
  })

  it("其他未知错误原样抛出", async () => {
    ;(chrome.tabs.sendMessage as any).mockRejectedValueOnce(new Error("网络断开"))
    await expect(sendTabMessage(1, "https://example.com", {})).rejects.toThrow("网络断开")
  })

  it("'before a response was received' 单独出现也判定为无响应，不尝试注入", async () => {
    ;(chrome.tabs.sendMessage as any).mockRejectedValueOnce(
      new Error("The message port closed before a response was received.")
    )
    await expect(sendTabMessage(1, "https://example.com", {})).rejects.toThrow(/没有响应/)
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })

  it("拿不到 tabUrl 时不预判受限，直接尝试注入", async () => {
    ;(chrome.tabs.sendMessage as any)
      .mockRejectedValueOnce(new Error("Receiving end does not exist."))
      .mockResolvedValueOnce({ ok: 1 })
    ;(chrome.scripting.executeScript as any).mockResolvedValueOnce([{}])

    const result = await sendTabMessage(1, undefined, { type: "X" })
    expect(result).toEqual({ ok: 1 })
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
  })

  it("注入后重试仍抛非 receiver 错误 → 报「没有响应」", async () => {
    ;(chrome.tabs.sendMessage as any)
      .mockRejectedValueOnce(new Error("Receiving end does not exist."))
      .mockRejectedValueOnce(new Error("页面内部炸了"))
    ;(chrome.scripting.executeScript as any).mockResolvedValueOnce([{}])

    await expect(sendTabMessage(1, "https://example.com", {})).rejects.toThrow(/没有响应/)
  })
})
