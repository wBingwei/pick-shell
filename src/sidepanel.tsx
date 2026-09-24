import { useState, useEffect, useRef, type DragEvent } from "react"
import "./sidepanel.css"
import { useContentAction } from "./popup/hooks/useContentAction"
import { convertToMarkdown, htmlToMarkdown } from "./lib/markdown-engine"
import { sendTabMessage } from "./lib/messaging"
import { isRestrictedUrl } from "./lib/utils"
import {
  BASKET_KEY,
  BASKET_UPDATED,
  getBasket,
  openEditor,
  setBasket as persistBasket
} from "./lib/basket"
import { t } from "./lib/i18n"

// PDF 导出固定使用「现代极简」主题
import modernCss from "data-text:./styles/modern.css"

// 导入图标：图标本身在浅色/深色背景上都可读，无需再分两套配色
import webSaverLogoRaw from "url:../assets/icon.svg"
const webSaverLogo = typeof webSaverLogoRaw === "string" ? webSaverLogoRaw : (webSaverLogoRaw as any).default

// 内联图标，避免为了几个小图标引入图标库
const ICONS = {
  plus: "M12 5v14M5 12h14",
  close: "M18 6 6 18M6 6l12 12",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  copy: "M9 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  download: "M12 3v12m0 0 4-4m-4 4-4-4M5 21h14",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  inbox: "M3 12h4l2 3h6l2-3h4M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-7Z",
  expand: "m6 9 6 6 6-6",
  collapse: "m18 15-6-6-6 6",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
}

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

// 拖拽手柄：竖向六个圆点
function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

// 「手动选区」的快捷键说明（与页面底部悬浮提示保持一致）
const buildPickKeymap = (): Array<{ keys: string[]; text: string }> => [
  { keys: ["↑", "←"], text: t("pick_key_parent") },
  { keys: ["↓", "→"], text: t("pick_key_child") },
  { keys: [t("key_space")], text: t("pick_key_join_clip") },
  { keys: ["Enter"], text: t("pick_key_capture_selected") },
  { keys: ["Esc"], text: t("pick_key_exit_mode") }
]

// 需要转发到页面内容脚本的按键
const FORWARD_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Spacebar", "Enter", "Escape"]

function IndexSidePanel() {

  const [format, setFormat] = useState("markdown")
  const [mode, setMode] = useState("auto")
  const [basket, setBasket] = useState<any[]>([])

  const [deepCapture, setDeepCapture] = useState(false)
  const [virtualListDetected, setVirtualListDetected] = useState(false)
  const [isRestrictedPage, setIsRestrictedPage] = useState(false)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // 导出标题：留空则用自动标题（单个片段取原文标题，多个片段取合成标题）
  const [docTitle, setDocTitle] = useState("")

  // 读取完成前不允许写回，否则首帧的空数组会把已存的暂存覆盖掉
  const hydratedRef = useRef(false)

  const {
    loading,
    status,
    statusType,
    setStatus,
    handleExport
  } = useContentAction(
    format,
    deepCapture,
    virtualListDetected,
    modernCss
  )

  // 导出标题：留空则自动生成——只有一个片段用原文标题，多个片段用合成标题
  const autoTitle =
    basket.length > 1
      ? t("composed_title", { DATE: new Date().toLocaleDateString() })
      : basket[0]?.title || t("default_export_title")
  const finalTitle = docTitle.trim() || autoTitle

  useEffect(() => {
    // 清理旧版本遗留的数据
    chrome.storage.local.remove(["knowledgeBase", "saveToKnowledgeBase", "webhookConfig", "webhookLogs", "lastPickedData"])

    chrome.storage.local.get(["deepCaptureEnabled", BASKET_KEY], (result) => {
      if (typeof result.deepCaptureEnabled === "boolean") setDeepCapture(result.deepCaptureEnabled)
      const stored = result[BASKET_KEY]
      if (Array.isArray(stored)) {
        // 旧数据只存了 HTML，补一份 Markdown，列表才能直接展示转换结果
        setBasket(
          stored.map((clip: any) => ({
            ...clip,
            markdown: clip.markdown || htmlToMarkdown(clip.content || "")
          }))
        )
      }
      hydratedRef.current = true
    })

    const updateCurrentTabInfo = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url) return
      
      const isRestricted = isRestrictedUrl(tab.url)
      setIsRestrictedPage(isRestricted)
      
      if (isRestricted) {
        setVirtualListDetected(false)
        return
      }

      sendTabMessage(tab.id, tab.url, { type: "DETECT_VIRTUAL_LIST" })
        .then((res) => {
          if (typeof res?.exists === "boolean") setVirtualListDetected(res.exists)
        })
        .catch(() => setVirtualListDetected(false))
    }

    updateCurrentTabInfo()

    const tabListener = () => updateCurrentTabInfo()
    chrome.tabs.onActivated.addListener(tabListener)
    chrome.tabs.onUpdated.addListener(tabListener)

    return () => {
      chrome.tabs.onActivated.removeListener(tabListener)
      chrome.tabs.onUpdated.removeListener(tabListener)
    }
  }, [])

  useEffect(() => {
    chrome.storage.local.set({ deepCaptureEnabled: deepCapture })
  }, [deepCapture])

  useEffect(() => {
    if (!hydratedRef.current) return
    persistBasket(basket)
    if (basket.length > 0) {
      chrome.action.setBadgeText({ text: basket.length.toString() })
      chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" })
    } else {
      chrome.action.setBadgeText({ text: "" })
    }
  }, [basket])

  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === "PICK_COMPLETE") {
        const newClip = {
          id: Date.now().toString(),
          ...message.payload,
          markdown: htmlToMarkdown(message.payload.content || ""),
          timestamp: new Date().toLocaleString(),
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(message.payload.url).hostname}&sz=32`
        }
        setBasket(prev => [...prev, newClip])
        setMode("auto")
      }
      // 页面里按 Esc 退出选区后，侧边栏的状态要跟着回到「整页提取」
      if (message.type === "PICK_EXIT") {
        setMode("auto")
      }
      // 编辑窗口保存后回来重新读取，保证两边一致
      if (message.type === BASKET_UPDATED) {
        getBasket().then(setBasket)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  // 选区模式下，用户刚点过侧边栏按钮，焦点还在侧边栏，
  // 此时按键不会传给页面，需要在这里转发给内容脚本统一处理。
  useEffect(() => {
    if (mode !== "pick") return

    const onKeyDown = async (e: KeyboardEvent) => {
      if (!FORWARD_KEYS.includes(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.id) return
        await sendTabMessage(tab.id, tab.url, { type: "PICK_KEY", key: e.key })
      } catch {
        // 页面不可用时忽略按键即可，不需要打扰用户
      }
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [mode])

  const addToBasket = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return
      setStatus(t("status_extracting"), "info")
      const article = await sendTabMessage(tab.id, tab.url, { 
        type: "EXTRACT_CONTENT",
        format: "markdown",
        deepCapture: deepCapture && virtualListDetected
      })
      
      if (article && !article.error) {
        const newClip = {
          id: Date.now().toString(),
          content: article.content,
          markdown: htmlToMarkdown(article.content),
          title: article.title,
          url: tab.url,
          timestamp: new Date().toLocaleString(),
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(tab.url!).hostname}&sz=32`
        }
        setBasket(prev => [...prev, newClip])
        setStatus(t("status_added"), "success")
      }
    } catch (e) {
      setStatus(t("status_add_failed"), "error")
    }
  }

  const removeFromBasket = (id: string) => {
    setBasket(prev => prev.filter(item => item.id !== id))
    setExpandedId(current => (current === id ? null : current))
  }

  // ===== 拖拽排序 =====
  const resetDrag = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  const handleDragStart = (index: number) => (e: DragEvent<HTMLLIElement>) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = "move"
    // Firefox 需要写入数据，拖拽才会真正开始
    e.dataTransfer.setData("text/plain", String(index))
  }

  const handleDragOver = (index: number) => (e: DragEvent<HTMLLIElement>) => {
    if (dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (overIndex !== index) setOverIndex(index)
  }

  const handleDrop = (index: number) => (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) {
      resetDrag()
      return
    }
    setBasket(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    resetDrag()
  }

  const handleMergeCopy = async () => {
    if (basket.length === 0) return
    setStatus(t("status_merging"), "info")
    try {
      // 优先在本地进行 Markdown 合成，避免依赖不稳定的后端服务
      const mergedHtml = basket.map((clip) => `
        <div class="synthesis-clip">
          ${clip.content}
        </div>
      `).join("\n")

      const sources = basket.map((clip) => clip.url).filter(Boolean)
      const text = await convertToMarkdown(mergedHtml, finalTitle, sources)
      
      await navigator.clipboard.writeText(text)
      setStatus(t("status_copied"), "success")
    } catch (err) {
      setStatus(t("status_merge_copy_failed", { MSG: err.message }), "error")
    }
  }

  const handleMergeExport = async () => {
    if (basket.length === 0) return
    setStatus(t("status_merging_short"), "info")
    
    try {
      const mergedHtml = basket.map((clip, index) => `
        <div class="synthesis-clip">
          ${clip.content}
          ${index < basket.length - 1 ? '<hr style="border: 0; border-top: 1px dashed #ddd; margin: 20px 0;">' : ''}
        </div>
      `).join("\n")

      // 调用导出逻辑
      await handleExport({
        content: mergedHtml,
        title: finalTitle,
        sources: basket.map((clip) => clip.url).filter(Boolean)
      })

      setStatus(t("status_export_done"), "success")
    } catch (err) {
      setStatus(t("status_merge_failed", { MSG: err.message }), "error")
    }
  }

  const handleModeSwitch = async (newMode: "auto" | "pick") => {
    // 再点一次「手动选区」= 重新开启选区，所以只有「整页提取」需要提前返回
    if (newMode === mode && newMode === "auto") return

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return

      if (newMode === "pick") {
        if (isRestrictedPage) {
          setStatus(t("pick_unsupported_page"), "warn")
          return
        }
        await sendTabMessage(tab.id, tab.url, { type: "ENTER_PICK_MODE" })
      } else {
        await sendTabMessage(tab.id, tab.url, { type: "EXIT_PICK_MODE" })
      }
      setMode(newMode)
    } catch (e) {
      console.error(e)
      if (newMode === "pick") setStatus(t("pick_start_failed"), "error")
    }
  }

  const handlePickMode = () => handleModeSwitch("pick")
  const handleAutoMode = () => handleModeSwitch("auto")

  return (
    <div className="ws-app">
      <header className="ws-header">
        <div className="ws-brand">
          <div className="ws-brand-logo-slot">
            <img src={webSaverLogo} alt="" className="ws-brand-logo" />
          </div>
          <div className="ws-brand-text">
            <h1>{t("extName")}</h1>
            <p>{t("brand_tagline")}</p>
          </div>
        </div>
      </header>

      <main className="ws-main">
        {isRestrictedPage && (
          <div className="ws-alert">
            <Icon d={ICONS.alert} />
            <span>{t("restricted_page_warning")}</span>
          </div>
        )}

        <section className="ws-card">
          <div className="ws-field-label">{t("capture_method")}</div>
          <div className="ws-segmented">
            <button className={mode === "auto" ? "is-active" : ""} onClick={handleAutoMode}>
              {t("mode_auto")}
            </button>
            <button className={mode === "pick" ? "is-active" : ""} onClick={handlePickMode}>
              {t("mode_pick")}
            </button>
          </div>

          {mode === "auto" ? (
            <div className="ws-mode-body">
              <p className="ws-hint">{t("mode_auto_hint")}</p>
              <button
                className="ws-btn ws-btn-primary ws-btn-block"
                onClick={addToBasket}
                disabled={loading || isRestrictedPage}
              >
                <Icon d={ICONS.plus} />
                {t("capture_current")}
              </button>
            </div>
          ) : (
            <div className="ws-mode-body">
              <p className="ws-hint">{t("mode_pick_hint")}</p>
              <ul className="ws-keymap">
                {buildPickKeymap().map((item) => (
                  <li key={item.text}>
                    <span className="ws-keycaps">
                      {item.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                    <span className="ws-keymap-text">{item.text}</span>
                  </li>
                ))}
              </ul>
              <button className="ws-btn ws-btn-secondary ws-btn-block" onClick={handleAutoMode}>
                {t("exit_pick")}
              </button>
            </div>
          )}
        </section>

        <section className="ws-card">
          <label className={`ws-switch-row${virtualListDetected ? "" : " is-disabled"}`}>
            <span className="ws-switch-labels">
              <span className="ws-switch-title">{t("deep_scroll_title")}</span>
              <span className="ws-switch-desc">
                {virtualListDetected
                  ? t("deep_scroll_on")
                  : t("deep_scroll_off")}
              </span>
            </span>
            <input
              type="checkbox"
              className="ws-switch"
              checked={deepCapture}
              disabled={!virtualListDetected}
              onChange={(e) => setDeepCapture(e.target.checked)}
            />
          </label>
        </section>

        <section className="ws-card">
          <div className="ws-card-head">
            <h2 className="ws-card-title">
              {t("basket_title")}
              {basket.length > 0 && <span className="ws-badge">{basket.length}</span>}
            </h2>
            <div className="ws-head-actions">
              {basket.length > 1 && <span className="ws-head-tip">{t("basket_drag_tip")}</span>}
              {basket.length > 0 && (
                <button
                  className="ws-btn ws-btn-ghost ws-btn-icon-sm ws-danger"
                  title={t("basket_clear")}
                  aria-label={t("basket_clear")}
                  onClick={() => {
                    setBasket([])
                    setExpandedId(null)
                  }}
                >
                  <Icon d={ICONS.trash} size={14} />
                </button>
              )}
            </div>
          </div>

          {basket.length === 0 ? (
            <div className="ws-empty">
              <Icon d={ICONS.inbox} size={26} />
              <p>{t("basket_empty")}</p>
            </div>
          ) : (
            <ol className="ws-clip-list">
              {basket.map((clip, index) => (
                <li
                  key={clip.id}
                  className={[
                    "ws-clip",
                    expandedId === clip.id ? "is-expanded" : "",
                    dragIndex === index ? "is-dragging" : "",
                    overIndex === index && dragIndex !== index ? "is-drop-target" : ""
                  ].filter(Boolean).join(" ")}
                  title={t("basket_drag_title")}
                  draggable
                  onClick={() => setExpandedId((current) => (current === clip.id ? null : clip.id))}
                  onDragStart={handleDragStart(index)}
                  onDragOver={handleDragOver(index)}
                  onDrop={handleDrop(index)}
                  onDragEnd={resetDrag}
                  onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
                >
                  <span className="ws-drag-handle" aria-hidden="true">
                    <GripIcon />
                  </span>
                  <span className="ws-clip-index">{index + 1}</span>
                  <div
                    className="ws-clip-preview"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {clip.markdown?.trim() || t("basket_no_text")}
                  </div>
                  <div className="ws-clip-side">
                    <button
                      className="ws-clip-btn ws-clip-edit"
                      title={t("clip_edit_markdown")}
                      aria-label={t("clip_edit_aria")}
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditor(clip)
                      }}
                    >
                      <Icon d={ICONS.edit} size={13} />
                    </button>
                    <button
                      className="ws-clip-btn ws-clip-toggle"
                      title={expandedId === clip.id ? t("clip_collapse") : t("clip_expand_full")}
                      aria-label={expandedId === clip.id ? t("clip_collapse_aria") : t("clip_expand_aria")}
                      aria-expanded={expandedId === clip.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedId((current) => (current === clip.id ? null : clip.id))
                      }}
                    >
                      <Icon d={expandedId === clip.id ? ICONS.collapse : ICONS.expand} size={13} />
                    </button>
                    <button
                      className="ws-clip-btn ws-clip-remove"
                      title={t("clip_remove")}
                      aria-label={t("clip_remove_aria")}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFromBasket(clip.id)
                      }}
                    >
                      <Icon d={ICONS.close} size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      <div className="ws-actionbar">
        {status && (
          <div className={`ws-toast is-${statusType}`} role="status">
            {status}
          </div>
        )}

        <div className="ws-title-row">
          <label className="ws-title-label" htmlFor="ws-doc-title">
            {t("doc_title_label")}
          </label>
          <input
            id="ws-doc-title"
            className="ws-title-input"
            type="text"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder={autoTitle}
            disabled={basket.length === 0}
          />
          {docTitle && (
            <button
              type="button"
              className="ws-title-clear"
              title={t("doc_title_restore")}
              aria-label={t("doc_title_restore")}
              onClick={() => setDocTitle("")}
            >
              <Icon d={ICONS.close} size={12} />
            </button>
          )}
        </div>

        <div className="ws-action-row">
          <div className="ws-format" role="group" aria-label={t("format_group_aria")}>
            <button className={format === "markdown" ? "is-active" : ""} onClick={() => setFormat("markdown")}>
              Markdown
            </button>
            <button className={format === "pdf" ? "is-active" : ""} onClick={() => setFormat("pdf")}>
              PDF
            </button>
          </div>

          {format !== "pdf" && (
            <button
              className="ws-btn ws-btn-secondary ws-btn-icon"
              title={t("copy_to_clipboard")}
              aria-label={t("copy_to_clipboard")}
              onClick={handleMergeCopy}
              disabled={loading || basket.length === 0}
            >
              <Icon d={ICONS.copy} size={15} />
            </button>
          )}

          <button
            className="ws-btn ws-btn-primary ws-grow"
            onClick={handleMergeExport}
            disabled={loading || basket.length === 0}
          >
            {loading ? (
              t("action_processing")
            ) : (
              <>
                <Icon d={ICONS.download} />
                {t("btn_export")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default IndexSidePanel
