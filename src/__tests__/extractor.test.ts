import { describe, it, expect, afterEach } from "vitest"
import { extractContent } from "../lib/extractor"

afterEach(() => {
  document.title = ""
  document.body.innerHTML = ""
})

describe("extractContent", () => {
  it("页面主体只有 <pre> 时走代码页特判分支", async () => {
    document.title = "raw.txt"
    document.body.innerHTML = "<pre>line one\nline two</pre>"

    const result = await extractContent("markdown", false)

    expect(result.title).toBe("raw.txt")
    expect(result.content).toContain("<pre>")
    expect(result.content).toContain("line one")
  })

  it("返回结构包含 title/content/excerpt/byline/siteName", async () => {
    document.title = "一篇普通文章"
    document.body.innerHTML =
      "<article><h1>标题</h1>" +
      Array.from({ length: 8 }, () => "<p>" + "这是用于测试正文提取的中文段落内容。".repeat(6) + "</p>").join("") +
      "</article>"

    const result = await extractContent("markdown", false)

    expect(result).toHaveProperty("content")
    expect(typeof result.content).toBe("string")
    expect(result.content).toContain("用于测试正文提取")
    expect(typeof result.excerpt).toBe("string")
    expect(typeof result.byline).toBe("string")
    expect(typeof result.siteName).toBe("string")
  })

  it("开启深度采集但页面没有可滚动容器时，回退到普通提取", async () => {
    document.title = "无容器页"
    document.body.innerHTML =
      "<div>" + Array.from({ length: 5 }, () => "<p>普通正文内容普通正文内容。</p>").join("") + "</div>"

    const result = await extractContent("markdown", true)

    // jsdom 下 getComputedStyle 无 overflow 滚动信息 → getBestScrollableContainer 返回 null → 走常规路径
    expect(typeof result.content).toBe("string")
    expect(result.content).toContain("普通正文内容")
  })

  it("pdf 格式对纯文本内容不报错（无图片则无需内联）", async () => {
    document.title = "PDF 导出"
    document.body.innerHTML = "<pre>console.log(1)</pre>"

    const result = await extractContent("pdf", false)
    expect(result.content).toContain("<pre>")
    // 没有图片 → 不会发起 FETCH_IMAGE_BLOB
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })
})
