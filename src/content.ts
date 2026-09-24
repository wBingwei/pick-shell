import type { PlasmoCSConfig } from "plasmo"
import { processHtmlImages } from "./lib/image-processor"
import { extractContent } from "./lib/extractor"
import { detectVirtualList } from "./lib/deep-capture"
import { enterPickMode, exitPickMode, handlePickKey } from "./lib/smart-pick"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

// ===== 监听来自 Popup / Background 的请求 =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.type === "EXTRACT_CONTENT") {
      console.log("Received extraction request for format:", request.format)
      extractContent(request.format, request.deepCapture)
        .then((res) => {
          console.log("Extraction complete")
          sendResponse(res)
        })
        .catch((err) => {
          console.error("Extraction error", err)
          sendResponse({ error: err.message })
        })
      return true // 保持异步连接
    }

    if (request.type === "DETECT_VIRTUAL_LIST") {
      const exists = detectVirtualList(document.body)
      sendResponse({ exists })
      return true
    }

    if (request.type === "PROCESS_IMAGES") {
      console.log("Processing images for provided HTML")
      processHtmlImages(request.html)
        .then((html) => {
          sendResponse({ html })
        })
        .catch((err) => {
          sendResponse({ error: err.message })
        })
      return true
    }

    if (request.type === "ENTER_PICK_MODE") {
      enterPickMode()
      sendResponse({ success: true })
      return true
    }

    if (request.type === "EXIT_PICK_MODE") {
      exitPickMode()
      sendResponse({ success: true })
      return true
    }

    // 焦点在侧边栏时，按键由侧边栏转发过来，和页面内按键走同一套逻辑
    if (request.type === "PICK_KEY") {
      const handled = handlePickKey(request.key)
      sendResponse({ handled })
      return true
    }

    if (request.type === "PICK_COMPLETE_DIRECT") {
      chrome.runtime.sendMessage({
        type: "PICK_COMPLETE",
        payload: request.payload
      })
      sendResponse({ success: true })
      return true
    }

    return false
  } catch (err) {
    // 同步异常如果直接抛出，消息端口会被关闭，调用方只能看到 "message port closed"
    console.error("[pick-shell] 内容脚本处理消息失败:", err)
    sendResponse({ error: err instanceof Error ? err.message : String(err) })
    return false
  }
})
