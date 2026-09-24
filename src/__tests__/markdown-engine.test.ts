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

  it("GFM 任务列表", () => {
    const html = markdownToHtml("- [x] done\n- [ ] todo")
    expect(html).toContain('type="checkbox"')
    expect(html).toContain("checked")
  })

  it("GFM 删除线", () => {
    const html = markdownToHtml("~~removed~~")
    expect(html).toContain("<del>removed</del>")
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

  it("识别 language-xxx 代码语言", () => {
    const md = htmlToMarkdown('<pre><code class="language-python">print(1)</code></pre>')
    expect(md).toContain("```python")
  })

  it("裸 pre（高亮库不套 code）也输出围栏代码块，不被压成一行", () => {
    const html = "<pre>line one\nline two\nline three</pre>"
    const md = htmlToMarkdown(html)
    expect(md).toContain("```")
    expect(md).toContain("line one")
    expect(md).toContain("line two")
    expect(md).toContain("line three")
  })

  it("剔除 pre 内的语言标签装饰节点", () => {
    const html =
      '<pre><span class="language-label">js</span><code class="language-js">const a = 1</code></pre>'
    const md = htmlToMarkdown(html)
    expect(md).not.toContain("language-label")
    expect(md).toContain("const a = 1")
  })

  it("button 等交互控件文字被丢弃", () => {
    const md = htmlToMarkdown("<div><p>正文内容</p><button>复制代码</button></div>")
    expect(md).toContain("正文内容")
    expect(md).not.toContain("复制代码")
  })

  it("保留 u/ins/mark 标签", () => {
    const md = htmlToMarkdown("<p><u>下划线</u><ins>插入</ins><mark>标记</mark></p>")
    expect(md).toContain("<u>")
    expect(md).toContain("<ins>")
    expect(md).toContain("<mark>")
  })

  it("无 src 的图片输出空字符串", () => {
    const md = htmlToMarkdown("<img alt='broken'>")
    expect(md.trim()).toBe("")
  })

  it("图片 title 写入引号标题", () => {
    const md = htmlToMarkdown('<img src="https://x.test/a.png" title="cap">')
    expect(md).toContain('(https://x.test/a.png "cap")')
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

  it("重复来源去重后只剩一条，用单数 source", async () => {
    const md = await convertToMarkdown("<p>x</p>", "T", [
      "https://a.com",
      "https://a.com"
    ])
    expect(md).toContain('source: "https://a.com"')
    expect(md).not.toContain("sources:")
  })

  it("多来源中重复项去重后仍为 sources 列表", async () => {
    const md = await convertToMarkdown("<p>x</p>", "T", [
      "https://a.com",
      "https://a.com",
      "https://b.com"
    ])
    expect(md).toContain("sources:")
    const aCount = md.match(/https:\/\/a\.com/g)?.length ?? 0
    expect(aCount).toBe(1)
  })
})
