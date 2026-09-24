import { isRestrictedUrl } from "./utils"
import { t } from "./i18n"

// 明确表示「目标页面里没有监听端」——可以靠动态注入脚本救回
const NO_RECEIVER_HINTS = [
  "Receiving end does not exist",
  "Could not establish connection"
]

// 「有监听端但没有回应」——通常是内容脚本内部抛了异常，重试注入没有意义
const NO_RESPONSE_HINTS = [
  "message port closed",
  "before a response was received"
]

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function matches(err: unknown, hints: string[]) {
  const message = getErrorMessage(err)
  return hints.some((hint) => message.includes(hint))
}

function getContentScriptFiles(): string[] {
  const manifest = chrome.runtime.getManifest()
  // Plasmo 打包后文件名带 hash，只能从 manifest 里取，不能硬编码
  return (manifest.content_scripts || []).flatMap((entry) => entry.js || [])
}

async function injectContentScript(tabId: number) {
  const files = getContentScriptFiles()
  if (files.length === 0) return false

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files })
    return true
  } catch (e) {
    console.warn("[pick-shell] 动态注入内容脚本失败:", e)
    return false
  }
}

/**
 * 向标签页发送消息。
 *
 * 内容脚本可能不存在（扩展刚更新但页面没刷新、页面还在加载、标签页被内存节省器休眠），
 * 此时 chrome.tabs.sendMessage 会抛 "Could not establish connection. Receiving end does not exist."。
 * 这里按 manifest 声明动态注入一次再重试，仍失败才抛出可读的错误文案。
 */
export async function sendTabMessage<T = any>(
  tabId: number,
  tabUrl: string | undefined,
  message: any
): Promise<T> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T
  } catch (err) {
    if (matches(err, NO_RESPONSE_HINTS)) {
      throw new Error(t("err_no_response"))
    }

    if (!matches(err, NO_RECEIVER_HINTS)) throw err

    // 拿不到 url（理论上 host_permissions 为 <all_urls> 时不会发生）时不预判，直接尝试注入
    if (tabUrl && isRestrictedUrl(tabUrl)) {
      throw new Error(t("err_restricted_page"))
    }

    if (!(await injectContentScript(tabId))) throw new Error(t("err_refresh_hint"))

    try {
      return (await chrome.tabs.sendMessage(tabId, message)) as T
    } catch (retryErr) {
      if (matches(retryErr, NO_RECEIVER_HINTS)) throw new Error(t("err_refresh_hint"))
      throw new Error(t("err_no_response"))
    }
  }
}
