export {}

// 监听下载或其他后台任务
chrome.runtime.onInstalled.addListener(() => {
  console.log("Web Saver 已安装")
  
  // 设置侧边栏行为：点击图标打开侧边栏
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.log(error))
  }

  // 创建右键菜单
  chrome.contextMenus.create({
    id: "extract-selection",
    title: "Web Saver: 导出当前选中区域",
    contexts: ["selection"]
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "extract-selection" && tab?.id) {
    // 处理右键选中内容导出
    const selectedHtml = `<div>${info.selectionText}</div>` // 简单处理，实际可更复杂
    chrome.tabs.sendMessage(tab.id, {
      type: "PICK_COMPLETE_DIRECT",
      payload: {
        content: selectedHtml,
        title: `${tab.title} (右键片段)`
      }
    })
  }
})


// 如果以后需要处理跨域图片抓取，可以在这里实现
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
