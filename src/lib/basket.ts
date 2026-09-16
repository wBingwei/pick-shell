import { markdownToHtml } from "./markdown-engine"

/**
 * 暂存篮的读写与「编辑片段」窗口的调度。
 *
 * 侧边栏与编辑窗口是两个独立文档，只能通过 chrome.storage 交换数据；
 * 编辑窗口保存后广播 BASKET_UPDATED，侧边栏收到后重新读取。
 */

export const BASKET_KEY = "basket"
export const EDIT_JOB_KEY = "editJob"

/** 暂存篮里的一个片段 */
export interface Clip {
  id: string
  /** 原始 HTML（导出 PDF 用，编辑后由 Markdown 重新生成） */
  content: string
  /** 转换后的 Markdown（列表展示、编辑用） */
  markdown?: string
  title?: string
  url?: string
  timestamp?: string
  favicon?: string
}

export const BASKET_UPDATED = "BASKET_UPDATED"

export async function getBasket(): Promise<Clip[]> {
  const result = await chrome.storage.local.get(BASKET_KEY)
  const clips = result?.[BASKET_KEY]
  return Array.isArray(clips) ? clips : []
}

export async function setBasket(clips: Clip[]) {
  await chrome.storage.local.set({ [BASKET_KEY]: clips })
}

/**
 * 打开编辑器：用一个无地址栏的弹出窗口，并尽可能最大化。
 * 编辑内容写在 storage 里，窗口自身不需要再接收大段文本。
 */
export async function openEditor(clip: Clip) {
  await chrome.storage.local.set({
    [EDIT_JOB_KEY]: { id: clip.id, title: clip.title, url: clip.url, markdown: clip.markdown || "" }
  })

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("tabs/editor.html"),
    type: "popup",
    focused: true,
    width: 1280,
    height: 880
  })

  // 尺寸在这台机器上尽力铺满；失败也不影响编辑（只是窗口小一点）
  if (win?.id !== undefined) {
    try {
      await chrome.windows.update(win.id, { state: "maximized" })
    } catch (e) {
      console.warn("[web-saver] 最大化编辑窗口失败:", e)
    }
  }

  return win
}

export interface EditJob {
  id: string
  title?: string
  url?: string
  markdown: string
}

/** 编辑窗口启动时读取待编辑内容（读到即删除） */
export async function takeEditJob(): Promise<EditJob | null> {
  const result = await chrome.storage.local.get(EDIT_JOB_KEY)
  const job = result?.[EDIT_JOB_KEY] as EditJob | undefined
  if (!job) return null
  await chrome.storage.local.remove(EDIT_JOB_KEY)
  return job
}

/**
 * 保存编辑结果：Markdown 作为新的事实来源，同时重新生成 HTML，
 * 让 PDF 打印页与 Markdown 合成沿用同一条导出链路。
 */
export async function saveClipMarkdown(id: string, markdown: string) {
  const clips = await getBasket()
  const next = clips.map((clip) =>
    clip.id === id ? { ...clip, markdown, content: markdownToHtml(markdown) } : clip
  )
  await setBasket(next)
  return next
}

/** 通知侧边栏重新读取暂存篮 */
export async function notifyBasketUpdated() {
  try {
    await chrome.runtime.sendMessage({ type: BASKET_UPDATED })
  } catch {
    // 侧边栏没开时没有接收方，属于正常情况
  }
}
