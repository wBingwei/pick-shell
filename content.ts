import type { PlasmoCSConfig } from "plasmo"
import { processHtmlImages } from "./lib/image-processor"
import { extractContent, extractBySelector } from "./lib/extractor"
import { detectVirtualList } from "./lib/deep-capture"
import { enterPickMode } from "./lib/smart-pick"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

// ===== 监听来自 Popup / Background 的请求 =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

  if (request.type === "EXTRACT_BY_SELECTOR") {
    extractBySelector(request.selectorPath, request.format, request.deepCapture)
      .then((res) => {
        sendResponse(res)
      })
      .catch((err) => {
        sendResponse({ error: err.message })
      })
    return true
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

  if (request.type === "PICK_COMPLETE_DIRECT") {
    chrome.runtime.sendMessage({
      type: "PICK_COMPLETE",
      payload: request.payload
    })
    sendResponse({ success: true })
    return true
  }
})
