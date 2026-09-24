import { useEffect, useState } from "react"
import { PRINT_JOB_KEY, type PrintJob } from "../lib/print-pdf"
import { t } from "../lib/i18n"
import "./print.css"

/**
 * 打印页：把暂存好的 HTML 渲染出来，等图片与字体就绪后唤起打印对话框。
 * 用户在对话框里选择「另存为 PDF」即完成导出。
 */
function PrintPage() {
  const [job, setJob] = useState<PrintJob | null>(null)
  const [error, setError] = useState("")
  const [printed, setPrinted] = useState(false)

  useEffect(() => {
    chrome.storage.local.get(PRINT_JOB_KEY, (result) => {
      const stored = result?.[PRINT_JOB_KEY] as PrintJob | undefined
      if (!stored?.html) {
        setError(t("print_missing"))
        return
      }
      // 读到就删，避免内容长期留在本地存储里
      chrome.storage.local.remove(PRINT_JOB_KEY)
      document.title = stored.title || t("default_export_title")
      setJob(stored)
    })
  }, [])

  // 等图片解码与字体就绪再打印，否则打印预览里会出现半张图
  useEffect(() => {
    if (!job) return
    let cancelled = false

    const waitForImages = () =>
      Promise.all(
        Array.from(document.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true })
                img.addEventListener("error", () => resolve(), { once: true })
              })
        )
      )

    const run = async () => {
      await waitForImages()
      if (document.fonts?.ready) await document.fonts.ready
      if (cancelled) return
      // 留一点排版稳定的时间，再自动唤起对话框
      setTimeout(() => {
        if (!cancelled) window.print()
      }, 200)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [job])

  useEffect(() => {
    const onAfterPrint = () => setPrinted(true)
    window.addEventListener("afterprint", onAfterPrint)
    return () => window.removeEventListener("afterprint", onAfterPrint)
  }, [])

  const closeTab = async () => {
    const current = await chrome.tabs.getCurrent()
    if (current?.id !== undefined) {
      chrome.tabs.remove(current.id)
    } else {
      window.close()
    }
  }

  if (error) {
    return (
      <div className="print-empty">
        <p>{error}</p>
        <button type="button" onClick={closeTab}>
          {t("print_close_page")}
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="print-bar">
        <div className="print-bar-text">
          <strong>{t("print_title")}</strong>
          <span>
            {t("print_guide")}
          </span>
        </div>
        <div className="print-bar-actions">
          {printed && <span className="print-bar-done">{t("print_ready_close")}</span>}
          <button type="button" className="print-btn print-btn-primary" onClick={() => window.print()}>
            {printed ? t("print_again") : t("print_or_save_pdf")}
          </button>
          <button type="button" className="print-btn" onClick={closeTab}>
            {t("print_close")}
          </button>
        </div>
      </div>

      {job && (
        <article className="print-doc">
          <style dangerouslySetInnerHTML={{ __html: job.css }} />
          <h1 className="print-doc-title">{job.title}</h1>
          <div dangerouslySetInnerHTML={{ __html: job.html }} />
        </article>
      )}
    </>
  )
}

export default PrintPage
