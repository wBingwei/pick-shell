import { sendTabMessage } from "./lib/messaging"
import { t } from "./lib/i18n"

export {}

// 监听下载或其他后台任务
chrome.runtime.onInstalled.addListener(() => {
  console.log("[pick-shell] installed")

  // 设置侧边栏行为：点击图标打开侧边栏
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.log(error))
  }

  // 创建右键菜单
  chrome.contextMenus.create({
    id: "extract-selection",
    title: t("menu_extract_selection"),
    contexts: ["selection"]
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "extract-selection" && tab?.id) {
    // 处理右键选中内容导出
    const selectedHtml = `<div>${info.selectionText}</div>` // 简单处理，实际可更复杂
    sendTabMessage(tab.id, tab.url, {
      type: "PICK_COMPLETE_DIRECT",
      payload: {
        content: selectedHtml,
        title: `${tab.title} ${t("menu_suffix_selection")}`
      }
    }).catch((err) => console.warn("[pick-shell] 右键导出失败:", err.message))
  }
})


// 由内容脚本发起：在后台跨域取图并转成 data URL，避免 canvas 被跨域图片污染
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "FETCH_IMAGE_BLOB") {
    fetch(request.url)
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader()
        reader.onloadend = () => sendResponse({ data: reader.result })
        reader.readAsDataURL(blob)
      })
      .catch(err => sendResponse({ error: err.message }))
    return true
  }
})
