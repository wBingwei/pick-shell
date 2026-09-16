import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  notifyBasketUpdated,
  saveClipMarkdown,
  takeEditJob,
  type EditJob
} from "../lib/basket"
import { markdownToHtml } from "../lib/markdown-engine"
import themeCss from "data-text:../styles/modern.css"
import "./editor.css"

const PREVIEW_HOST_ID = "ws-preview-host"

/**
 * 预览用 iframe 的骨架：主题 CSS 挂在 iframe 内部，
 * 因此它作用于 iframe 的 body（与导出效果完全一致），又不会污染编辑器自己的界面。
 */
const PREVIEW_SKELETON = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>${themeCss}</style>
<style>
  html { background: #fff; }
  body { min-height: 100%; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; }
  pre { overflow-x: auto; }
</style>
</head>
<body>
<div id="${PREVIEW_HOST_ID}"></div>
</body>
</html>`

type ToolbarAction = {
  label: string
  title: string
  kind: "wrap" | "prefix" | "block"
  before?: string
  after?: string
  block?: string
}

const TOOLBAR: ToolbarAction[][] = [
  [
    { label: "H1", title: "一级标题", kind: "prefix", before: "# " },
    { label: "H2", title: "二级标题", kind: "prefix", before: "## " },
    { label: "H3", title: "三级标题", kind: "prefix", before: "### " }
  ],
  [
    { label: "粗体", title: "加粗（Ctrl/Cmd + B）", kind: "wrap", before: "**", after: "**" },
    { label: "斜体", title: "斜体（Ctrl/Cmd + I）", kind: "wrap", before: "*", after: "*" },
    { label: "删除线", title: "删除线", kind: "wrap", before: "~~", after: "~~" },
    { label: "行内代码", title: "行内代码", kind: "wrap", before: "`", after: "`" }
  ],
  [
    { label: "引用", title: "引用块", kind: "prefix", before: "> " },
    { label: "无序列表", title: "无序列表", kind: "prefix", before: "- " },
    { label: "有序列表", title: "有序列表", kind: "prefix", before: "1. " }
  ],
  [
    { label: "链接", title: "链接（Ctrl/Cmd + K）", kind: "wrap", before: "[", after: "](https://)" },
    { label: "图片", title: "图片", kind: "wrap", before: "![", after: "](https://)" },
    { label: "代码块", title: "代码块", kind: "block", block: "```\n\n```" },
    { label: "表格", title: "表格", kind: "block", block: "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |" },
    { label: "分割线", title: "分割线", kind: "block", block: "---" }
  ]
]

function EditorPage() {
  const [job, setJob] = useState<EditJob | null>(null)
  const [error, setError] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [savedMarkdown, setSavedMarkdown] = useState("")
  const [html, setHtml] = useState("")
  const [frameReady, setFrameReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<[number, number] | null>(null)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)

  const dirty = job !== null && markdown !== savedMarkdown

  // ===== 载入待编辑内容 =====
  useEffect(() => {
    takeEditJob().then((loaded) => {
      if (!loaded) {
        setError("没有找到要编辑的片段，请回到侧边栏重新点击「编辑」。")
        return
      }
      document.title = loaded.title ? `编辑 · ${loaded.title}` : "拾贝 · 编辑片段"
      setJob(loaded)
      setMarkdown(loaded.markdown || "")
      setSavedMarkdown(loaded.markdown || "")
    })
  }, [])

  // ===== 预览：防抖渲染，避免长文每敲一个字就重排 =====
  useEffect(() => {
    const timer = setTimeout(() => setHtml(markdownToHtml(markdown)), 120)
    return () => clearTimeout(timer)
  }, [markdown])

  // 用命令式写入预览内容，保留 iframe 的滚动位置（srcDoc 每次重建会把视口弹回顶部）
  useEffect(() => {
    if (!frameReady) return
    const host = previewRef.current?.contentDocument?.getElementById(PREVIEW_HOST_ID)
    if (host) host.innerHTML = html
  }, [html, frameReady])

  // 恢复光标位置
  useLayoutEffect(() => {
    if (!pending || !taRef.current) return
    taRef.current.focus()
    taRef.current.setSelectionRange(pending[0], pending[1])
    setPending(null)
  }, [pending])

  const edit = useCallback((next: string, start: number, end: number) => {
    setMarkdown(next)
    setPending([start, end])
  }, [])

  const runAction = useCallback(
    (action: ToolbarAction) => {
      const ta = taRef.current
      if (!ta) return
      const { value, selectionStart: s, selectionEnd: e } = ta

      if (action.kind === "wrap") {
        const before = action.before || ""
        const after = action.after || ""
        const selected = value.slice(s, e)
        const next = value.slice(0, s) + before + selected + after + value.slice(e)
        edit(next, s + before.length, s + before.length + selected.length)
        return
      }

      if (action.kind === "block") {
        const block = action.block || ""
        const lineStart = value.lastIndexOf("\n", s - 1) + 1
        const needsBreak = lineStart > 0 && value.slice(lineStart, s).trim() !== ""
        const prefix = needsBreak ? "\n\n" : ""
        const next = value.slice(0, s) + prefix + block + "\n" + value.slice(e)
        const caret = s + prefix.length + block.length + 1
        edit(next, caret, caret)
        return
      }

      // prefix：对选中的每一行加前缀；若每行都已有该前缀则改成取消
      const prefix = action.before || ""
      const lineStart = value.lastIndexOf("\n", s - 1) + 1
      const lineEndIndex = value.indexOf("\n", e)
      const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
      const block = value.slice(lineStart, lineEnd)
      const lines = block.split("\n")
      const allPrefixed = lines.every((line) => line.startsWith(prefix))
      const nextLines = lines.map((line) =>
        allPrefixed ? line.slice(prefix.length) : prefix + line
      )
      const nextBlock = nextLines.join("\n")
      const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd)
      const delta = nextBlock.length - block.length
      edit(next, s, Math.max(s, e + delta))
    },
    [edit]
  )

  // 弹出的编辑器窗口同样是一个 tab，用 tabs.remove 比 window.close() 更可靠
  const closeWindow = useCallback(async () => {
    try {
      const current = await chrome.tabs.getCurrent()
      if (current?.id !== undefined) {
        await chrome.tabs.remove(current.id)
        return
      }
    } catch {
      // 落到下面的兜底
    }
    window.close()
  }, [])

  const handleSave = useCallback(async () => {
    if (!job || saving) return
    setSaving(true)
    try {
      await saveClipMarkdown(job.id, markdown)
      await notifyBasketUpdated()
      await closeWindow()
    } catch (err: any) {
      setSaving(false)
      setError(`保存失败：${err?.message || err}`)
    }
  }, [job, markdown, saving, closeWindow])

  const handleClose = useCallback(() => {
    if (dirty && !window.confirm("有未保存的修改，确定放弃并关闭吗？")) return
    closeWindow()
  }, [dirty, closeWindow])

  // 快捷键：Ctrl/Cmd + S 保存，B/I/K 常用格式，Tab 缩进
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault()
        handleSave()
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        handleClose()
        return
      }
      if (!mod || e.altKey) return

      const key = e.key.toLowerCase()
      const wrapMap: Record<string, [string, string]> = {
        b: ["**", "**"],
        i: ["*", "*"],
        k: ["[", "](https://)"]
      }
      const wrap = wrapMap[key]
      if (!wrap) return
      e.preventDefault()
      runAction({ label: "", title: "", kind: "wrap", before: wrap[0], after: wrap[1] })
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleSave, handleClose, runAction])

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return
    e.preventDefault()
    const ta = e.currentTarget
    const { value, selectionStart: s, selectionEnd: end } = ta
    edit(value.slice(0, s) + "  " + value.slice(end), s + 2, s + 2)
  }

  if (error && !job) {
    return (
      <div className="editor-empty">
        <p>{error}</p>
        <button type="button" onClick={closeWindow}>
          关闭
        </button>
      </div>
    )
  }

  const charCount = markdown.length
  const lineCount = markdown ? markdown.split("\n").length : 0

  return (
    <div className="editor-app">
      <header className="editor-bar">
        <div className="editor-bar-info">
          <strong>拾贝 · 编辑片段</strong>
          {job?.title && <span className="editor-bar-title">{job.title}</span>}
          {job?.url && (
            <a className="editor-bar-url" href={job.url} target="_blank" rel="noreferrer">
              {job.url}
            </a>
          )}
        </div>
        <div className="editor-bar-actions">
          <span className="editor-count">
            {charCount} 字 · {lineCount} 行
          </span>
          {dirty && <span className="editor-dirty">未保存</span>}
          <button type="button" className="editor-btn editor-btn-primary" onClick={handleSave} disabled={saving}>
            保存并关闭
          </button>
          <button type="button" className="editor-btn" onClick={handleClose}>
            取消
          </button>
        </div>
      </header>

      <div className="editor-toolbar">
        {TOOLBAR.map((group, index) => (
          <div className="editor-toolbar-group" key={index}>
            {group.map((action) => (
              <button
                key={action.label}
                type="button"
                title={action.title}
                className="editor-tool"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {error && <div className="editor-error">{error}</div>}

      <main className="editor-body">
        <section className="editor-pane">
          <div className="editor-pane-head">Markdown</div>
          <textarea
            ref={taRef}
            className="editor-textarea"
            value={markdown}
            spellCheck={false}
            onChange={(e) => setMarkdown(e.target.value)}
            onKeyDown={handleTab}
            placeholder="在这里编辑 Markdown，右侧实时预览……"
          />
        </section>

        <section className="editor-pane">
          <div className="editor-pane-head">预览（与导出效果一致）</div>
          <iframe
            ref={previewRef}
            className="editor-preview"
            title="预览"
            srcDoc={PREVIEW_SKELETON}
            onLoad={() => setFrameReady(true)}
          />
        </section>
      </main>
    </div>
  )
}

export default EditorPage
