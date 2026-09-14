import { useState, useEffect } from "react"
import "./sidepanel.css"
import { useContentAction } from "./popup/hooks/useContentAction"
import { convertToMarkdown } from "./lib/markdown-engine"

type WebhookConfig = {
  enabled: boolean
  name: string
  url: string
  method: "POST" | "PUT"
  trigger: "manual" | "auto"
  headers: string
  secret: string
  payloadMode: "full" | "text"
}

const defaultWebhookConfig: WebhookConfig = {
  enabled: false,
  name: "",
  url: "",
  method: "POST",
  trigger: "manual",
  headers: "",
  secret: "",
  payloadMode: "full"
}

// 导入 CSS 模板内容
import modernCss from "data-text:~styles/modern.css"
import serifCss from "data-text:~styles/serif.css"
import darkCss from "data-text:~styles/dark.css"

// 导入图标
import webSaverLogoRaw from "url:~assets/icon.svg"
const webSaverLogo = typeof webSaverLogoRaw === "string" ? webSaverLogoRaw : (webSaverLogoRaw as any).default



function IndexSidePanel() {

  const [theme, setTheme] = useState("modern")
  const [format, setFormat] = useState("markdown")
  const [mode, setMode] = useState("auto")
  const [pickedData, setPickedData] = useState<any>(null)
  const [basket, setBasket] = useState<any[]>([])
  const [knowledgeBase, setKnowledgeBase] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<"direct" | "basket" | "knowledge">("direct")
  const [editingDoc, setEditingDoc] = useState<any>(null)
  const [kbSearch, setKbSearch] = useState("")
  const [kbCategory, setKbCategory] = useState("all")
  const [kbPage, setKbPage] = useState(1)
  const itemsPerPage = 20

  const [deepCapture, setDeepCapture] = useState(false)
  const [saveToKnowledgeBase, setSaveToKnowledgeBase] = useState(false)
  const [virtualListDetected, setVirtualListDetected] = useState(false)
  const [isRestrictedPage, setIsRestrictedPage] = useState(false)
  const [webhookConfig, setWebhookConfig] = useState(defaultWebhookConfig)

  const themes = {
    modern: { name: "现代极简", css: modernCss },
    serif: { name: "经典衬线", css: serifCss },
    dark: { name: "暗黑模式", css: darkCss },
  }

  const {
    loading,
    copying,
    status,
    setStatus,
    handleCopy,
    handleExport,
    webhookSending,
    webhookStatus,
    webhookLogs,
    handleSendWebhook,
    handleTestWebhook
  } = useContentAction(
    pickedData,
    setPickedData,
    theme,
    themes,
    format,
    deepCapture,
    virtualListDetected,
    webhookConfig,
    saveToKnowledgeBase,
    setKnowledgeBase
  )

  const isRestrictedUrl = (url: string) => {
    const restrictedProtocols = ["chrome:", "chrome-extension:", "about:", "edge:", "view-source:"]
    return restrictedProtocols.some(p => url.startsWith(p)) || url.includes("chrome.google.com/webstore")
  }

  useEffect(() => {
    chrome.storage.local.get(["lastPickedData", "deepCaptureEnabled", "webhookConfig", "basket", "saveToKnowledgeBase", "knowledgeBase"], (result) => {
      if (result.lastPickedData) setPickedData(result.lastPickedData)
      if (typeof result.deepCaptureEnabled === "boolean") setDeepCapture(result.deepCaptureEnabled)
      if (typeof result.saveToKnowledgeBase === "boolean") setSaveToKnowledgeBase(result.saveToKnowledgeBase)
      if (result.webhookConfig) {
        setWebhookConfig({ ...defaultWebhookConfig, ...result.webhookConfig })
      }
      if (result.basket) setBasket(result.basket)
      if (result.knowledgeBase) setKnowledgeBase(result.knowledgeBase)
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

      chrome.tabs.sendMessage(tab.id, { type: "DETECT_VIRTUAL_LIST" })
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
    chrome.storage.local.set({ saveToKnowledgeBase })
  }, [saveToKnowledgeBase])

  useEffect(() => {
    chrome.storage.local.set({ webhookConfig })
  }, [webhookConfig])

  useEffect(() => {
    chrome.storage.local.set({ basket })
    if (basket.length > 0) {
      chrome.action.setBadgeText({ text: basket.length.toString() })
      chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" })
    } else {
      chrome.action.setBadgeText({ text: "" })
    }
  }, [basket])

  useEffect(() => {
    chrome.storage.local.set({ knowledgeBase })
  }, [knowledgeBase])

  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === "PICK_COMPLETE") {
        const newClip = {
          id: Date.now().toString(),
          ...message.payload,
          timestamp: new Date().toLocaleString(),
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(message.payload.url).hostname}&sz=32`
        }
        setBasket(prev => [...prev, newClip])
        setActiveTab("basket")
        setMode("auto")
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const addToBasket = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return
      setStatus("正在捕获...")
      const article = await chrome.tabs.sendMessage(tab.id, { 
        type: "EXTRACT_CONTENT",
        format: "markdown",
        deepCapture: deepCapture && virtualListDetected
      })
      
      if (article && !article.error) {
        const newClip = {
          id: Date.now().toString(),
          content: article.content,
          title: article.title,
          url: tab.url,
          timestamp: new Date().toLocaleString(),
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(tab.url!).hostname}&sz=32`
        }
        setBasket(prev => [...prev, newClip])
        setActiveTab("basket")
        setStatus("成功装进口袋！")
      }
    } catch (e) {
      setStatus("加入暂存失败")
    }
  }

  const removeFromBasket = (id: string) => {
    setBasket(prev => prev.filter(item => item.id !== id))
  }

  const moveClip = (id: string, direction: "up" | "down") => {
    const index = basket.findIndex(item => item.id === id)
    if (index === -1) return
    const newBasket = [...basket]
    if (direction === "up" && index > 0) {
      [newBasket[index], newBasket[index - 1]] = [newBasket[index - 1], newBasket[index]]
    } else if (direction === "down" && index < basket.length - 1) {
      [newBasket[index], newBasket[index + 1]] = [newBasket[index + 1], newBasket[index]]
    }
    setBasket(newBasket)
  }

  const handleMergeCopy = async () => {
    if (basket.length === 0) return
    setStatus("正在智能合成...")
    try {
      // 优先在本地进行 Markdown 合成，避免依赖不稳定的后端服务
      const mergedHtml = basket.map((clip) => `
        <div class="synthesis-clip">
          <div class="clip-meta" style="font-size: 12px; color: #666; margin-bottom: 8px; border-left: 3px solid #1a73e8; padding-left: 8px;">
            来自: <a href="${clip.url}" target="_blank">${clip.title}</a> (${clip.timestamp})
          </div>
          ${clip.content}
        </div>
      `).join("\n")

      const synthesisTitle = `Web Saver 合成文档 - ${new Date().toLocaleDateString()}`
      const text = await convertToMarkdown(mergedHtml, synthesisTitle, "")
      
      await navigator.clipboard.writeText(text)
      setStatus("合并内容已成功拷贝！")
    } catch (err) {
      setStatus(`合成拷贝失败: ${err.message}`)
    }
  }

  const handleMergeExport = async () => {
    if (basket.length === 0) return
    setStatus("正在敲贝壳 (智能合成)...")
    
    try {
      const mergedHtml = basket.map((clip, index) => `
        <div class="synthesis-clip">
          <div class="clip-meta" style="font-size: 12px; color: #666; margin-bottom: 8px; border-left: 3px solid #1a73e8; padding-left: 8px;">
            来自: <a href="${clip.url}" target="_blank">${clip.title}</a> (${clip.timestamp})
          </div>
          ${clip.content}
          ${index < basket.length - 1 ? '<hr style="border: 0; border-top: 1px dashed #ddd; margin: 20px 0;">' : ''}
        </div>
      `).join("\n")

      const synthesisTitle = `Web Saver 合成文档 - ${new Date().toLocaleDateString()}`

      // 调用导出逻辑
      await handleExport({
        content: mergedHtml,
        title: synthesisTitle,
        url: "web-saver/synthesis"
      })

      setStatus("项链打磨完成 (导出成功)！")
    } catch (err) {
      setStatus(`合成失败: ${err.message}`)
    }
  }

  const handleModeSwitch = async (newMode: "auto" | "pick") => {
    if (newMode === mode) return
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return

      if (newMode === "pick") {
        if (isRestrictedPage) {
          setStatus("由于安全限制，无法在此页面开启选区")
          return
        }
        await chrome.tabs.sendMessage(tab.id, { type: "ENTER_PICK_MODE" })
      } else {
        await chrome.tabs.sendMessage(tab.id, { type: "EXIT_PICK_MODE" })
      }
      setMode(newMode)
    } catch (e) {
      console.error(e)
      if (newMode === "pick") setStatus("选区启动失败")
    }
  }

  const handlePickMode = () => handleModeSwitch("pick")
  const handleAutoMode = () => handleModeSwitch("auto")

  const updateWebhookConfig = (key: string, value: string | boolean) => {
    setWebhookConfig((prev) => ({ ...prev, [key]: value }))
  }

  const handleSaveKbDoc = (doc: any) => {
    if (doc.id) {
      setKnowledgeBase(prev => prev.map(item => item.id === doc.id ? doc : item))
    } else {
      const newDoc = {
        ...doc,
        id: Date.now().toString(),
        timestamp: new Date().toLocaleString()
      }
      setKnowledgeBase(prev => [newDoc, ...prev])
    }
    setEditingDoc(null)
  }

  const deleteKbDoc = (id: string) => {
    if (confirm("确定要删除这条记录吗？")) {
      setKnowledgeBase(prev => prev.filter(item => item.id !== id))
    }
  }

  const filteredKb = knowledgeBase.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(kbSearch.toLowerCase()) || 
                         doc.content.toLowerCase().includes(kbSearch.toLowerCase())
    const matchesCategory = kbCategory === "all" || doc.category === kbCategory
    return matchesSearch && matchesCategory
  })

  const paginatedKb = filteredKb.slice((kbPage - 1) * itemsPerPage, kbPage * itemsPerPage)
  const totalKbPages = Math.ceil(filteredKb.length / itemsPerPage)

  const categories = Array.from(new Set(knowledgeBase.map(d => d.category).filter(Boolean)))

  // 极简 Markdown 预览解析器 (仅用于预览展示)
  const renderMarkdown = (md: string) => {
    if (!md) return ""
    return md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
      .replace(/\*(.*)\*/gim, '<i>$1</i>')
      .replace(/\!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
      .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2' target='_blank'>$1</a>")
      .replace(/\n/gim, '<br />')
  }

  if (editingDoc) {
    return (
      <div className="sidepanel-container editor-view animate-fade-in">
        <header>
          <div className="editor-header">
            <button className="btn-back" onClick={() => setEditingDoc(null)}>← 返回</button>
            <h2>{editingDoc.id ? "编辑文档" : "添加文档"}</h2>
          </div>
        </header>
        <main style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div className="option-group">
            <label>标题</label>
            <input 
              className="text-input" 
              value={editingDoc.title} 
              onChange={e => setEditingDoc({...editingDoc, title: e.target.value})}
              placeholder="输入标题..."
            />
          </div>
          <div className="option-group">
            <label>分类</label>
            <input 
              className="text-input" 
              value={editingDoc.category || ""} 
              onChange={e => setEditingDoc({...editingDoc, category: e.target.value})}
              placeholder="输入分类 (可选)..."
            />
          </div>
          <div className="tab-nav mini-tabs">
            <button className={editingDoc.viewMode !== "preview" ? "active" : ""} onClick={() => setEditingDoc({...editingDoc, viewMode: "edit"})}>编辑</button>
            <button className={editingDoc.viewMode === "preview" ? "active" : ""} onClick={() => setEditingDoc({...editingDoc, viewMode: "preview"})}>预览</button>
          </div>
          {editingDoc.viewMode === "preview" ? (
            <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(editingDoc.content) }} />
          ) : (
            <textarea 
              className="text-area full-height" 
              value={editingDoc.content} 
              onChange={e => setEditingDoc({...editingDoc, content: e.target.value})}
              placeholder="支持 Markdown 格式..."
            />
          )}
          <button className="btn-primary" style={{ marginTop: "auto" }} onClick={() => handleSaveKbDoc(editingDoc)}>保存到知识库</button>
        </main>
      </div>
    )
  }

  return (
    <div className="sidepanel-container">
      <header>
        <div className="brand-header">
          <img src={webSaverLogo} alt="Web Saver Logo" style={{ width: "28px", height: "28px" }} />
          <div className="brand-text">
            <h1>Web Saver</h1>
            <span className="slogan">把网页中碎片知识用更好的文件格式保存下来</span>
          </div>
        </div>


        <div className="tab-nav">
          <button className={activeTab === "direct" ? "active" : ""} onClick={() => setActiveTab("direct")}>
            直接采集
          </button>
          <button className={activeTab === "basket" ? "active" : ""} onClick={() => setActiveTab("basket")}>
            口袋 (暂存) {basket.length > 0 && <span className="badge">{basket.length}</span>}
          </button>
          <button className={activeTab === "knowledge" ? "active" : ""} onClick={() => setActiveTab("knowledge")}>
            知识库
          </button>
        </div>
      </header>

      <main>
        {activeTab === "direct" ? (
          <>
            <div className="mode-toggle">
              <button className={mode === "auto" ? "active" : ""} onClick={handleAutoMode}>
                智能全页
              </button>
              <button className={mode === "pick" ? "active" : ""} onClick={handlePickMode}>
                灵动选区
              </button>
            </div>

            <p className="hint-text">
              {mode === "auto" 
                ? "Web Saver 会帮你提取整页正文并存进口袋。" 
                : "在页面上挑选碎石子（片段），我会帮你装好。"}
            </p>

            <div className="option-group">
              <label>导出格式</label>
              <div className="format-selector">
                <button className={format === "markdown" ? "active" : ""} onClick={() => setFormat("markdown")}>Markdown</button>
                <button className={format === "pdf" ? "active" : ""} onClick={() => setFormat("pdf")}>PDF</button>
              </div>
            </div>

            <div className="option-group">
              <label>智能存储</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={saveToKnowledgeBase}
                  onChange={(e) => setSaveToKnowledgeBase(e.target.checked)}
                />
                <span>同时保存到 Web Saver 知识库</span>
              </div>
            </div>

            {virtualListDetected && (
              <div className="option-group">
                <label>深度捕获</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={deepCapture}
                    onChange={(e) => setDeepCapture(e.target.checked)}
                  />
                  <span>海獭潜水模式 (自动滚动)</span>
                </div>
              </div>
            )}

            <div className="btn-group">
              {format !== "pdf" && (
                <button 
                  className="btn-primary" 
                  onClick={handleCopy} 
                  disabled={copying}
                >
                  <span className="btn-content">
                    {copying ? "正在转换..." : "拷贝到剪贴板"}
                  </span>
                </button>
              )}
              <button className={format === "pdf" ? "btn-primary" : "btn-secondary"} onClick={() => handleExport()} disabled={loading}>
                <span className="btn-content">{loading ? "正在处理..." : `导出为 ${format.toUpperCase()}`}</span>
              </button>
            </div>

            <div className="option-group webhook-section">
              <div className="webhook-header">
                <label>Webhook 分发</label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={webhookConfig.enabled}
                    onChange={(e) => updateWebhookConfig("enabled", e.target.checked)}
                  />
                  <span>启用</span>
                </label>
              </div>
              {webhookConfig.enabled && (
                <div className="webhook-mini-config">
                  <input
                    className="text-input"
                    placeholder="目标 URL"
                    value={webhookConfig.url}
                    onChange={(e) => updateWebhookConfig("url", e.target.value)}
                  />
                  <button className="btn-secondary btn-sm" onClick={handleSendWebhook} disabled={!webhookConfig.url || webhookSending}>
                    {webhookSending ? "发送中..." : "推送到 Webhook"}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : activeTab === "basket" ? (
          <div className="basket-view">
            <div className="basket-actions-top">
              <button className="btn-add-more" onClick={addToBasket} disabled={loading}>
                采集当前页到口袋
              </button>
              {basket.length > 0 && (
                <button className="btn-text-only" onClick={() => setBasket([])}>
                  清空
                </button>
              )}
            </div>

            {basket.length === 0 ? (
              <div className="empty-basket">
                <img src={webSaverLogo} alt="Empty Basket" style={{ width: "64px", height: "64px", opacity: 0.3, marginBottom: "12px", filter: "grayscale(1)" }} />
                <p>口袋空空的</p>
                <p className="hint-text">快去网页上找点亮晶晶的知识吧！</p>
              </div>
            ) : (
              <>
                <div className="clip-list">
                  {basket.map((clip) => (
                    <div key={clip.id} className="clip-card">
                      <div className="clip-card-header">
                        <img src={clip.favicon} className="favicon" alt="" />
                        <span className="clip-source">{clip.title}</span>
                        <div className="clip-actions">
                          <button onClick={() => moveClip(clip.id, "up")}>↑</button>
                          <button onClick={() => moveClip(clip.id, "down")}>↓</button>
                          <button className="remove" onClick={() => removeFromBasket(clip.id)}>×</button>
                        </div>
                      </div>
                      <div className="clip-preview" dangerouslySetInnerHTML={{ __html: clip.content }} />
                    </div>
                  ))}
                </div>

                <div className="synthesis-options">
                   <div className="option-group" style={{ marginBottom: 0 }}>
                    <label>PDF 导出主题</label>
                    <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                      <option value="modern">现代极简</option>
                      <option value="serif">经典衬线</option>
                      <option value="dark">暗黑模式</option>
                    </select>
                  </div>
                </div>

                <div className="btn-group-row">
                  <button className="btn-primary flex-2" onClick={handleMergeExport} disabled={loading}>
                    <span className="btn-content">合并导出 {format === "pdf" ? "(PDF)" : ""}</span>
                  </button>
                  {format !== "pdf" && (
                    <button 
                      className="btn-secondary flex-1" 
                      onClick={handleMergeCopy} 
                      disabled={loading}
                    >
                      <span className="btn-content">拷贝</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="kb-view animate-fade-in">
            <div className="kb-header-actions">
              <button className="btn-add-kb" onClick={() => setEditingDoc({ title: "", content: "", category: "", viewMode: "edit" })}>
                + 新增文档
              </button>
              <div className="kb-filters">
                <input 
                  className="search-input" 
                  placeholder="搜索知识库..." 
                  value={kbSearch}
                  onChange={e => { setKbSearch(e.target.value); setKbPage(1); }}
                />
                <select value={kbCategory} onChange={e => { setKbCategory(e.target.value); setKbPage(1); }}>
                  <option value="all">所有分类</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredKb.length === 0 ? (
              <div className="empty-kb">
                <p>没有找到相关文档</p>
              </div>
            ) : (
              <>
                <div className="kb-list">
                  {paginatedKb.map(doc => (
                    <div key={doc.id} className="kb-card">
                      <div className="kb-card-main" onClick={() => setEditingDoc({...doc, viewMode: "preview"})}>
                        <div className="kb-card-title">{doc.title}</div>
                        <div className="kb-card-meta">
                          {doc.category && <span className="kb-tag">{doc.category}</span>}
                          <span className="kb-time">{doc.timestamp}</span>
                        </div>
                      </div>
                      <div className="kb-card-actions">
                        <button title="拷贝" onClick={() => {
                          const text = doc.content
                          navigator.clipboard.writeText(text)
                          setStatus("已复制到剪贴板")
                        }}>📋</button>
                        <button title="导出 Markdown" onClick={() => {
                          const blob = new Blob([doc.content], { type: "text/markdown" })
                          const url = URL.createObjectURL(blob)
                          chrome.downloads.download({ url, filename: `${doc.title}.md`, saveAs: true })
                        }}>M↓</button>
                        <button title="导出 PDF" onClick={() => {
                           handleExport({
                            content: renderMarkdown(doc.content),
                            title: doc.title,
                            url: doc.url || "Web Saver Knowledge Base"
                          })
                        }}>PDF</button>
                        <button className="delete" title="删除" onClick={() => deleteKbDoc(doc.id)}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {totalKbPages > 1 && (
                  <div className="pagination">
                    <button disabled={kbPage === 1} onClick={() => setKbPage(p => p - 1)}>上一页</button>
                    <span>{kbPage} / {totalKbPages}</span>
                    <button disabled={kbPage === totalKbPages} onClick={() => setKbPage(p => p + 1)}>下一页</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {status && <div className={`status-msg ${status.includes("成功") ? "success" : ""}`}>{status}</div>}
      </main>

      <footer>Web Saver · 把碎片连成项链</footer>
    </div>
  )
}

export default IndexSidePanel
