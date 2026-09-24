import { describe, it, expect } from "vitest"
import { openPrintPage, PRINT_JOB_KEY } from "../lib/print-pdf"

describe("openPrintPage", () => {
  it("把打印任务写入 storage 并打开打印页 tab", async () => {
    const job = { title: "导出文档", html: "<p>hi</p>", css: "body{color:#000}" }
    await openPrintPage(job)

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [PRINT_JOB_KEY]: job })
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
    const args = (chrome.tabs.create as any).mock.calls[0][0]
    expect(args.active).toBe(true)
    expect(args.url).toContain("tabs/print.html")
  })
})
