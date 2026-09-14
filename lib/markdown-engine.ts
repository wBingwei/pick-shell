import TurndownService from "turndown"
// @ts-ignore
import { gfm } from "turndown-plugin-gfm"

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
      return `\n\n[🎥 点击观看嵌入内容](${src})\n\n`
    }
  })

  // 4. 保留部分 HTML 标签 (保持下划线、折叠面板等)
  service.keep(["details", "summary", "u", "ins", "mark"])

  return service
}

const turndownService = createTurndownService()

/**
 * 将 HTML 转换为带有 Front Matter 的 Markdown
 */
export async function convertToMarkdown(html: string, title: string, url: string = "") {
  const markdown = turndownService.turndown(html)
  
  // 生成 YAML Front Matter
  const frontMatter = [
    "---",
    `title: ${JSON.stringify(title)}`,
    url ? `url: ${url}` : null,
    `captured_at: ${new Date().toISOString()}`,
    "---",
    "",
    ""
  ].filter(Boolean).join("\n")

  return `${frontMatter}# ${title}\n\n${markdown}`
}
