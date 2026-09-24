import { describe, it, expect, beforeEach, vi } from "vitest"

// 隔离 hook 的三个外部依赖
vi.mock("../lib/markdown-engine", () => ({
  convertToMarkdown: vi.fn()
}))
vi.mock("../lib/print-pdf", () => ({
  openPrintPage: vi.fn()
}))
vi.mock("../lib/messaging", () => ({
  sendTabMessage: vi.fn()
}))

import { renderHook, act } from "@testing-library/react"
import { useContentAction } from "../popup/hooks/useContentAction"
import { convertToMarkdown } from "../lib/markdown-engine"
import { openPrintPage } from "../lib/print-pdf"
import { sendTabMessage } from "../lib/messaging"

beforeEach(() => {
  vi.mocked(convertToMarkdown).mockResolvedValue("# 转换结果")
  vi.mocked(openPrintPage).mockResolvedValue(undefined)
  ;(chrome.tabs.query as any).mockResolvedValue([
    { id: 7, url: "https://example.com/a", title: "当前页" }
  ])
  ;(chrome.downloads.download as any).mockResolvedValue(101)
  ;(URL as any).createObjectURL = vi.fn(() => "blob:mock")
})

async function runExport(format: string, params?: any, options?: { deepCapture?: boolean; detected?: boolean }) {
  const hook = renderHook(() =>
    useContentAction(format, options?.deepCapture ?? false, options?.detected ?? false, "THEME-CSS")
  )
  await act(async () => {
    await hook.result.current.handleExport(params)
  })
  return hook.result.current
}

describe("useContentAction", () => {
  it("Markdown 整页提取：发 EXTRACT_CONTENT、转换并下载 .md", async () => {
    vi.mocked(sendTabMessage).mockResolvedValue({ title: "文章标题", content: "<p>正文</p>" } as any)

    const r = await runExport("markdown")

    expect(sendTabMessage).toHaveBeenCalledWith(7, "https://example.com/a", {
      type: "EXTRACT_CONTENT",
      format: "markdown",
      deepCapture: false
    })
    expect(convertToMarkdown).toHaveBeenCalledWith("<p>正文</p>", "文章标题", ["https://example.com/a"])
    const downloadArg = (chrome.downloads.download as any).mock.calls[0][0]
    expect(downloadArg.filename).toBe("文章标题.md")
    expect(r.status).toContain("成功")
    expect(r.loading).toBe(false)
  })

  it("deepCapture 与检测结果做与运算后透传", async () => {
    vi.mocked(sendTabMessage).mockResolvedValue({ title: "t", content: "<p>x</p>" } as any)

    await runExport("markdown", undefined, { deepCapture: true, detected: true })
    expect(sendTabMessage).toHaveBeenCalledWith(
      7,
      expect.any(String),
      expect.objectContaining({ deepCapture: true })
    )
  })

  it("Markdown 合成导出（带 params）：跳过提取，直接用片段内容和来源转换", async () => {
    const r = await runExport("markdown", {
      content: "<p>合成体</p>",
      title: "合成文档",
      sources: ["https://a.com", "https://b.com"]
    })

    expect(sendTabMessage).not.toHaveBeenCalled()
    expect(convertToMarkdown).toHaveBeenCalledWith("<p>合成体</p>", "合成文档", [
      "https://a.com",
      "https://b.com"
    ])
    expect(r.status).toContain("成功")
  })

  it("PDF 整页提取：打开打印页并传入主题 CSS", async () => {
    vi.mocked(sendTabMessage).mockResolvedValue({ title: "PDF文档", content: "<p>x</p>" } as any)

    await runExport("pdf")

    expect(openPrintPage).toHaveBeenCalledWith({
      title: "PDF文档",
      html: "<p>x</p>",
      css: "THEME-CSS"
    })
    expect(chrome.downloads.download).not.toHaveBeenCalled()
  })

  it("PDF 合成导出：先走 PROCESS_IMAGES 内联图片，再打开打印页", async () => {
    vi.mocked(sendTabMessage).mockImplementation(async (_id, _url, msg: any) =>
      msg.type === "PROCESS_IMAGES" ? { html: "<p>已内联图片</p>" } : null
    )

    await runExport("pdf", { content: "<p>原始</p>", title: "合成PDF", sources: [] })

    expect(sendTabMessage).toHaveBeenCalledWith(
      7,
      expect.any(String),
      expect.objectContaining({ type: "PROCESS_IMAGES", html: "<p>原始</p>" })
    )
    expect(openPrintPage).toHaveBeenCalledWith({
      title: "合成PDF",
      html: "<p>已内联图片</p>",
      css: "THEME-CSS"
    })
  })

  it("图片处理返回 error 时中断导出", async () => {
    vi.mocked(sendTabMessage).mockResolvedValue({ error: "图片跨域" } as any)

    const r = await runExport("pdf", { content: "<p>x</p>", title: "t", sources: [] })

    expect(r.status).toContain("图片跨域")
    expect(openPrintPage).not.toHaveBeenCalled()
  })

  it("提取结果带 error 字段时报错且不下载", async () => {
    vi.mocked(sendTabMessage).mockResolvedValue({ error: "页面结构异常" } as any)

    const r = await runExport("markdown")

    expect(r.status).toContain("页面结构异常")
    expect(chrome.downloads.download).not.toHaveBeenCalled()
    expect(r.loading).toBe(false)
  })

  it("拿不到当前标签页时报错", async () => {
    ;(chrome.tabs.query as any).mockResolvedValue([])

    const r = await runExport("markdown")

    expect(r.status).toContain("无法获取当前页面")
    expect(sendTabMessage).not.toHaveBeenCalled()
  })
})
