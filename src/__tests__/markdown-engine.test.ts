import { describe, it, expect } from "vitest"
import { markdownToHtml, htmlToMarkdown, convertToMarkdown } from "../lib/markdown-engine"

describe("markdownToHtml", () => {
  it("基本 Markdown 转 HTML", () => {
    const html = markdownToHtml("# Hello\n\nThis is **bold**.")
    expect(html).toContain("<h1>")
    expect(html).toContain("<strong>bold</strong>")
  })

  it("空输入返回空字符串", () => {
    expect(markdownToHtml("")).toBe("")
    expect(markdownToHtml("   ")).toBe("")
  })

  it("GFM 表格", () => {
    const md = "| a | b |\n| --- | --- |\n| 1 | 2 |"
    const html = markdownToHtml(md)
    expect(html).toContain("<table>")
    expect(html).toContain("<th>")
    expect(html).toContain("<td>")
  })
})

describe("htmlToMarkdown", () => {
  it("基本标签转换", () => {
    const md = htmlToMarkdown("<h1>Title</h1><p>Paragraph <strong>bold</strong></p>")
    expect(md).toContain("# Title")
    expect(md).toContain("**bold**")
  })

  it("空输入返回空字符串", () => {
    expect(htmlToMarkdown("")).toBe("")
  })

  it("保留 details/summary 标签", () => {
    const md = htmlToMarkdown("<details><summary>Click me</summary>inner</details>")
    expect(md).toContain("<details>")
    expect(md).toContain("<summary>")
  })

  it("懒加载图片取 data-src", () => {
    const md = htmlToMarkdown('<img data-src="https://lazy.test/foo.png" alt="lazy">')
    expect(md).toContain("https://lazy.test/foo.png")
  })

  it("Iframe 转可点击链接", () => {
    const md = htmlToMarkdown('<iframe src="https://video.test/embed/123"></iframe>')
    expect(md).toContain("🎥")
    expect(md).toContain("https://video.test/embed/123")
  })

  it("相邻重复代码块去重", () => {
    const html = `
      <pre><code>console.log(1)</code></pre>
      <pre><code>console.log(1)</code></pre>
    `
    const md = htmlToMarkdown(html)
    const occurrences = md.match(/```/g)?.length ?? 0
    // 两对 ``` = 一个代码块
    expect(occurrences).toBe(2)
  })
})

describe("convertToMarkdown", () => {
  it("注入 YAML front matter", async () => {
    const md = await convertToMarkdown("<p>Hello</p>", "My Title", ["https://example.com"])
    expect(md).toContain("---")
    expect(md).toContain('title: "My Title"')
    expect(md).toContain('source: "https://example.com"')
    expect(md).toContain("captured_at:")
    expect(md).toContain("# My Title")
  })

  it("多来源生成 sources 列表", async () => {
    const md = await convertToMarkdown("<p>x</p>", "T", ["https://a.com", "https://b.com"])
    expect(md).toContain("sources:")
    expect(md).toContain("- \"https://a.com\"")
    expect(md).toContain("- \"https://b.com\"")
    // 不应出现单数 source
    expect(md).not.toMatch(/^\s*source:/m)
  })

  it("无来源时不注入 source/sources 字段", async () => {
    const md = await convertToMarkdown("<p>x</p>", "T", [])
    expect(md).not.toContain("source:")
    expect(md).toContain("title:")
  })

  it("空来源数组不影响 front matter 格式", async () => {
    const md = await convertToMarkdown("<p>x</p>", "T", [])
    expect(md).toContain("---")
    expect(md).toContain("# T")
  })

  it("标题只取第一行", async () => {
    const md = await convertToMarkdown("<p>x</p>", "Line1\nLine2", [])
    // Front matter 里的 JSON.stringify 会把换行变成 \n 字面量
    expect(md).toContain('title: "Line1')
  })

  it("过滤空来源", async () => {
    const md = await convertToMarkdown("<p>x</p>", "T", ["", "https://a.com", null as any, ""])
    expect(md).toContain("source:")
    expect(md).not.toContain('source: ""')
  })
})
