import { useCallback, useState } from "react"
import { convertToMarkdown } from "../../lib/markdown-engine"
import { openPrintPage } from "../../lib/print-pdf"
import { sendTabMessage } from "../../lib/messaging"
import { t } from "../../lib/i18n"

export type StatusType = "info" | "success" | "warn" | "error"

export function useContentAction(
  format: string,
  deepCapture: boolean,
  virtualListDetected: boolean,
  pdfCss: string
) {
  const [loading, setLoading] = useState(false)
  const [status, setStatusText] = useState("")
  const [statusType, setStatusType] = useState<StatusType>("info")

  // 统一收口：文案 + 类型一起设置，避免各处自己判断颜色
  const setStatus = useCallback((text: string, type: StatusType = "info") => {
    setStatusText(text)
    setStatusType(type)
  }, [])

  const handleExport = useCallback(async (params?: any) => {
    setLoading(true)
    setStatus(t("action_processing"), "info")

    try {
      let article = params
      let needsImageProcess = false
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error(t("err_no_active_tab"))

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
        setStatus(t("action_inlining_images"), "info")
        const res = await sendTabMessage(tab.id, tab.url, {
          type: "PROCESS_IMAGES",
          html: article.content
        })
        if (res.error) throw new Error(res.error)
        article = { ...article, content: res.html }
      }

      if (article?.error) throw new Error(article.error)
      if (!article) {
        setStatus(t("action_extract_failed_retry"), "error")
        setLoading(false)
        return
      }

      // 两种格式都在浏览器本地完成，不再依赖后端服务
      if (format === "markdown") {
        setStatus(t("action_converting_md"), "info")

        const sources: string[] = params?.sources?.length ? params.sources : tab.url ? [tab.url] : []
        const text = await convertToMarkdown(article.content, article.title, sources)
        const blob = new Blob([text], { type: "text/markdown" })
        const url = URL.createObjectURL(blob)
        const filename = `${article.title || "export"}.md`
        await chrome.downloads.download({ url, filename, saveAs: true })
        setStatus(t("action_export_success"), "success")
      } else {
        // PDF：打开扩展内的打印页，由 Chrome 打印管线渲染，用户选「另存为 PDF」即可
        setStatus(t("action_preparing_print"), "info")

        await openPrintPage({
          title: article.title || t("default_export_title"),
          html: article.content,
          css: pdfCss
        })

        setStatus(t("action_print_opened"), "success")
      }
    } catch (err) {
      console.error(err)
      setStatus(t("action_error_prefix", { MSG: err.message }), "error")
    } finally {
      setLoading(false)
    }
  }, [format, deepCapture, virtualListDetected, pdfCss])

  return {
    loading,
    status,
    statusType,
    setStatus,
    handleExport
  }
}
