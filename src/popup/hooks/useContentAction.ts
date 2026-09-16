import { useCallback, useState } from "react"
import { convertToMarkdown } from "../../lib/markdown-engine"
import { openPrintPage } from "../../lib/print-pdf"
import { sendTabMessage } from "../../lib/messaging"

export function useContentAction(
  format: string,
  deepCapture: boolean,
  virtualListDetected: boolean,
  pdfCss: string
) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("")

  const handleExport = useCallback(async (params?: any) => {
    setLoading(true)
    setStatus("正在处理数据...")

    try {
      let article = params
      let needsImageProcess = false
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error("无法获取当前页面")

      const deepEnabled = deepCapture && virtualListDetected

      if (!article) {
        article = await sendTabMessage(tab.id, tab.url, {
          type: "EXTRACT_CONTENT",
          format: format,
          deepCapture: deepEnabled
        })
      } else {
        needsImageProcess = format === "pdf"
      }

      if (needsImageProcess && article) {
        setStatus("正在内联图片 (Base64)...")
        const res = await sendTabMessage(tab.id, tab.url, {
          type: "PROCESS_IMAGES",
          html: article.content
        })
        if (res.error) throw new Error(res.error)
        article = { ...article, content: res.html }
      }

      if (article?.error) throw new Error(article.error)
      if (!article) {
        setStatus("提取失败，请重试")
        setLoading(false)
        return
      }

      // 两种格式都在浏览器本地完成，不再依赖后端服务
      if (format === "markdown") {
        setStatus("正在本地转换为 MARKDOWN...")

        const sources: string[] = params?.sources?.length ? params.sources : tab.url ? [tab.url] : []
        const text = await convertToMarkdown(article.content, article.title, sources)
        const blob = new Blob([text], { type: "text/markdown" })
        const url = URL.createObjectURL(blob)
        const filename = `${article.title || "export"}.md`
        await chrome.downloads.download({ url, filename, saveAs: true })
        setStatus("导出成功！")
      } else {
        // PDF：打开扩展内的打印页，由 Chrome 打印管线渲染，用户选「另存为 PDF」即可
        setStatus("正在准备打印页...")

        await openPrintPage({
          title: article.title || "拾贝导出",
          html: article.content,
          css: pdfCss
        })

        setStatus("已在新标签页打开，选择「另存为 PDF」即可")
      }
    } catch (err) {
      console.error(err)
      setStatus(`错误: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [format, deepCapture, virtualListDetected, pdfCss])

  return {
    loading,
    status,
    setStatus,
    handleExport
  }
}
