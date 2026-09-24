import TurndownService from "turndown"
import { marked } from "marked"
// @ts-ignore
import { gfm } from "turndown-plugin-gfm"
import { t } from "./i18n"

// 取代码文本：优先最内层 <code>，这样能把 <pre> 里的语言标签排除在外
function getCodeText(pre: any): string {
  const codeEl = pre.querySelector("code")
  if (codeEl) return codeEl.textContent || ""

  // 有些高亮库不套 <code>，此时克隆一份并剔除语言标签等装饰节点
  const clone = pre.cloneNode(true)
  clone.querySelectorAll('[class*="language" i], [class*="lang-" i]').forEach((el: any) => el.remove())
  return clone.textContent || ""
}

// 识别代码语言：class="language-xxx" 优先，其次找 <pre> 内的语言标签
function detectCodeLanguage(pre: any, codeEl: any): string {
  const candidates = [codeEl?.className, pre.getAttribute("class"), pre.getAttribute("data-language")]
  for (const candidate of candidates) {
    const matched = String(candidate || "").match(/(?:language|lang)-([\w+#.-]+)/i)
    if (matched) return matched[1].toLowerCase()
  }

  const label = pre.querySelector('[class*="language" i], [class*="lang" i]')
  const text = (label?.textContent || "").trim()
  return /^[a-z0-9+#.-]{1,20}$/i.test(text) ? text.toLowerCase() : ""
}

// 初始化 Turndown 服务并配置插件
const createTurndownService = () => {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*"
  })

  // 1. 使用 GFM 插件 (包含删除线、任务列表、表格等)
  service.use(gfm)

  // 2. 自定义规则：处理懒加载图片
  service.addRule("lazyLoadImage", {
    filter: "img",
    replacement: function (content, node: any) {
      const realSrc = node.getAttribute("data-src") || 
                      node.getAttribute("data-original") || 
                      node.getAttribute("data-lazy-src") || 
                      node.getAttribute("src") || ""
      const alt = node.getAttribute("alt") || ""
      const title = node.getAttribute("title") || ""
      return realSrc ? `![${alt}](${realSrc}${title ? ` "${title}"` : ""})` : ""
    }
  })

  // 3. 自定义规则：处理 Iframe (视频等)
  service.addRule("iframe", {
    filter: "iframe",
    replacement: function (content, node: any) {
      const src = node.getAttribute("src") || ""
      if (!src) return ""
      return `\n\n[${t("embed_video_link")}](${src})\n\n`
    }
  })

  // 4. 覆盖内置围栏代码块规则
  // 内置规则的 filter 要求 pre.firstChild 必须是 <code>，但很多站点会在 <pre> 里
  // 先放语言标签、或用 <pre><pre> 嵌套做高亮。一旦不匹配就会退化成行内代码，
  // 而内置行内 code 规则会把换行替换成空格，导致代码被压成一行。
  service.addRule("fencedCodeBlock", {
    filter: (node: any) => node.nodeName === "PRE",
    replacement: (_content: string, node: any) => {
      const code = getCodeText(node).replace(/^\n+/, "").replace(/\s+$/, "")
      if (!code) return ""

      const language = detectCodeLanguage(node, node.querySelector("code"))
      let fence = "```"
      while (code.includes(fence)) fence += "`"

      return `\n\n${fence}${language}\n${code}\n${fence}\n\n`
    }
  })

  // 5. 丢弃交互控件：代码块的「复制 / 下载 / 全屏」等按钮文字不属于正文内容
  service.remove("button")

  // 6. 保留部分 HTML 标签 (保持下划线、折叠面板等)
  service.keep(["details", "summary", "u", "ins", "mark"])

  return service
}

const turndownService = createTurndownService()

/**
 * 高亮库常见做法是同时渲染「占位块 + 高亮块」，两段代码内容完全一致。
 * 这里只折叠相邻的重复代码块，不做任何内容删除，避免误伤。
 */
function collapseDuplicateCodeBlocks(markdown: string): string {
  return markdown.replace(/(```[^\n]*\n[\s\S]*?\n```)\s*\1/g, "$1")
}

/**
 * Markdown → HTML（GFM：表格、任务列表、删除线开箱可用）。
 *
 * 用于两处：编辑器的实时预览，以及用户在编辑器里改完 Markdown 后
 * 回写 `content`——这样导出链路（PDF 打印页、Markdown 合成）无需任何改动。
 */
export function markdownToHtml(markdown: string) {
  if (!markdown) return ""
  try {
    return marked.parse(markdown, { async: false }) as string
  } catch (e) {
    console.warn("[pick-shell] Markdown 渲染失败:", e)
    return ""
  }
}

/**
 * 只做 HTML → Markdown 正文转换，不注入 Front Matter 与标题。
 * 用于暂存区直接展示「转换后的 Markdown」。
 */
export function htmlToMarkdown(html: string) {
  if (!html) return ""
  try {
    return collapseDuplicateCodeBlocks(turndownService.turndown(html)).trim()
  } catch (e) {
    console.warn("[pick-shell] HTML 转 Markdown 失败:", e)
    return ""
  }
}

/**
 * 将 HTML 转换为带有 YAML Front Matter 的 Markdown。
 *
 * 来源信息写入 front matter：单一来源写 `source`，多个来源写 `sources` 列表。
 */
export async function convertToMarkdown(html: string, title: string, sources: string[] = []) {
  const markdown = collapseDuplicateCodeBlocks(turndownService.turndown(html))
  const uniqueSources = Array.from(new Set(sources.filter(Boolean)))

  const frontMatter = [
    "---",
    `title: ${JSON.stringify(title)}`,
    ...(uniqueSources.length === 1
      ? [`source: ${JSON.stringify(uniqueSources[0])}`]
      : uniqueSources.length > 1
        ? ["sources:", ...uniqueSources.map((url) => `  - ${JSON.stringify(url)}`)]
        : []),
    `captured_at: ${new Date().toISOString()}`,
    "---"
  ]

  // 标题必须是单行，否则一级标题会被换行截断
  const heading = title.replace(/\s+/g, " ").trim()

  return `${frontMatter.join("\n")}\n\n# ${heading}\n\n${markdown}`
}
