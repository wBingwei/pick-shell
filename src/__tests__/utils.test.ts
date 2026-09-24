import { describe, it, expect, vi, beforeEach } from "vitest"
import { sleep, isRestrictedUrl, simpleHash } from "../lib/utils"

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("等待指定毫秒后 resolve", async () => {
    const fn = vi.fn()
    sleep(100).then(fn)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    await Promise.resolve() // 让微任务跑一次
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("isRestrictedUrl", () => {
  it("对受限协议返回 true", () => {
    expect(isRestrictedUrl("chrome://settings")).toBe(true)
    expect(isRestrictedUrl("chrome-extension://abc")).toBe(true)
    expect(isRestrictedUrl("devtools://something")).toBe(true)
    expect(isRestrictedUrl("about:blank")).toBe(true)
    expect(isRestrictedUrl("view-source:https://example.com")).toBe(true)
    expect(isRestrictedUrl("edge://newtab")).toBe(true)
  })

  it("对 null/undefined/空字符串返回 true", () => {
    expect(isRestrictedUrl(null)).toBe(true)
    expect(isRestrictedUrl(undefined)).toBe(true)
    expect(isRestrictedUrl("")).toBe(true)
  })

  it("对 Chrome Web Store 页面返回 true", () => {
    expect(isRestrictedUrl("https://chrome.google.com/webstore/detail/xxx")).toBe(true)
    expect(isRestrictedUrl("https://chromewebstore.google.com/detail/yyy")).toBe(true)
  })

  it("对普通 https/http 页面返回 false", () => {
    expect(isRestrictedUrl("https://example.com/article")).toBe(false)
    expect(isRestrictedUrl("http://blog.test.org/post")).toBe(false)
  })
})

describe("simpleHash", () => {
  it("相同输入产生相同输出", () => {
    expect(simpleHash("hello world")).toBe(simpleHash("hello world"))
  })

  it("不同输入产生不同输出（绝大多数情况）", () => {
    const a = simpleHash("foo")
    const b = simpleHash("bar")
    expect(a).not.toBe(b)
  })

  it("输出是十六进制字符串", () => {
    const h = simpleHash("test")
    expect(/^[0-9a-f]+$/.test(h)).toBe(true)
  })

  it("空字符串也能产生输出", () => {
    expect(typeof simpleHash("")).toBe("string")
  })
})
