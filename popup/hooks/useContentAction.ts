import { useState, useEffect, useCallback } from "react"
import { convertToMarkdown } from "../../lib/markdown-engine"
import TurndownService from "turndown"

const turndownService = new TurndownService()

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

type WebhookLog = {
  id: string
  time: string
  status: "success" | "error"
  code?: number
  message: string
}


export function useContentAction(
  pickedData: any,
  setPickedData: (data: any) => void,
  theme: string,
  themes: any,
  format: string,
  deepCapture: boolean,
  virtualListDetected: boolean,
  webhookConfig: WebhookConfig,
  saveToKnowledgeBase: boolean,
  setKnowledgeBase: (fn: (prev: any[]) => any[]) => void
) {
  const [loading, setLoading] = useState(false)
  const [copying, setCopying] = useState(false)
  const [status, setStatus] = useState("")
  const [webhookSending, setWebhookSending] = useState(false)
  const [webhookStatus, setWebhookStatus] = useState("")
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])

  useEffect(() => {
    chrome.storage.local.get(["webhookLogs"], (result) => {
      if (Array.isArray(result.webhookLogs)) setWebhookLogs(result.webhookLogs)
    })
  }, [])

  const appendWebhookLog = useCallback((log: WebhookLog) => {
    setWebhookLogs((prev) => {
      const next = [log, ...prev].slice(0, 10)
      chrome.storage.local.set({ webhookLogs: next })
      return next
    })
  }, [])

  const getSelectionType = () => {
    if (pickedData?.selectorPath || pickedData?.content) return "manual_selection"
    return "smart_selection"
  }

  const parseHeaders = (raw: string) => {
    if (!raw?.trim()) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch (e) {
      throw new Error("自定义 Header 不是有效 JSON")
    }
  }

  const getTextFromHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, "text/html")
    return doc.body.textContent?.replace(/\s+/g, " ").trim() || ""
  }

  const buildPayload = (article: any, pageUrl: string, selectionType: string) => {
    const timestamp = Math.floor(Date.now() / 1000)
    const html = article?.content || ""
    const markdown = turndownService.turndown(html)
    const text = getTextFromHtml(html)
    const payload = {
      event: "content.captured",
      source: "FlowPage",
      timestamp,
      data: {
        id: crypto?.randomUUID ? crypto.randomUUID() : `fp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: article?.title || "Untitled",
        url: pageUrl,
        content: { markdown, html, text },
        metadata: {
          author: article?.byline || "",
          tags: [],
          excerpt: article?.excerpt || ""
        },
        selection_type: selectionType
      }
    }

    if (webhookConfig.payloadMode === "text") {
      return {
        event: payload.event,
        source: payload.source,
        timestamp: payload.timestamp,
        title: payload.data.title,
        url: payload.data.url,
        text: payload.data.content.text
      }
    }

    return payload
  }

  const signPayload = async (secret: string, payload: string) => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
    return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("")
  }

  const sendWebhook = async (payload: any, isTest: boolean = false) => {
    if (!webhookConfig.enabled) throw new Error("Webhook 未启用")
    if (!webhookConfig.url) throw new Error("请填写 Webhook 地址")

    const headers = parseHeaders(webhookConfig.headers)
    const body = JSON.stringify(payload)

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers
    }

    if (webhookConfig.secret) {
      const signature = await signPayload(webhookConfig.secret, body)
      requestHeaders["X-FlowPage-Signature"] = `sha256=${signature}`
    }

    const response = await fetch(webhookConfig.url, {
      method: webhookConfig.method || "POST",
      headers: requestHeaders,
      body
    })

    const responseText = await response.text().catch(() => "")

    appendWebhookLog({
      id: crypto?.randomUUID ? crypto.randomUUID() : `log_${Date.now()}`,
      time: new Date().toLocaleString(),
      status: response.ok ? "success" : "error",
      code: response.status,
      message: response.ok ? (isTest ? "测试成功" : "推送成功") : (responseText || response.statusText)
    })

    if (!response.ok) throw new Error(responseText || response.statusText)
  }

  const maybeAutoSendWebhook = async (article: any, pageUrl: string) => {
    if (!webhookConfig.enabled || webhookConfig.trigger !== "auto") return
    setWebhookSending(true)
    setWebhookStatus("正在自动推送到 Webhook...")
    try {
      const payload = buildPayload(article, pageUrl, getSelectionType())
      await sendWebhook(payload)
      setWebhookStatus("已自动推送到 Webhook")
    } catch (e) {
      setWebhookStatus(`自动推送失败: ${e.message}`)
    } finally {
      setWebhookSending(false)
    }
  }

  const maybeSaveToKnowledgeBase = async (article: any, pageUrl: string) => {
    if (!saveToKnowledgeBase) return
    
    // 保存到本地知识库状态 (会自动触发 storage 同步)
    const newDoc = {
      id: Date.now().toString(),
      title: article.title || "未命名文档",
      url: pageUrl,
      content: article.content,
      timestamp: new Date().toLocaleString(),
      category: "自动采集"
    }
    setKnowledgeBase(prev => [newDoc, ...prev])

    console.log("Saving to knowledge base mock backend...")
    try {
      const payload = {
        title: article.title,
        url: pageUrl,
        content: article.content,
        timestamp: new Date().toISOString()
      }
      const response = await fetch("http://localhost:3000/knowledge-base/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        console.error("Failed to save to knowledge base:", await response.text())
      }
    } catch (e) {
      console.error("Error saving to knowledge base:", e)
    }
  }

  const getArticleForWebhook = async () => {
    let article = pickedData
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error("无法获取当前页面")

    const deepEnabled = deepCapture && virtualListDetected

    if (!article || (deepEnabled && pickedData?.selectorPath)) {
      if (pickedData?.selectorPath) {
        article = await chrome.tabs.sendMessage(tab.id, {
          type: "EXTRACT_BY_SELECTOR",
          selectorPath: pickedData.selectorPath,
          format: "markdown",
          deepCapture: true
        })
        if (article && pickedData?.title) article.title = pickedData.title
      } else {
        article = await chrome.tabs.sendMessage(tab.id, {
          type: "EXTRACT_CONTENT",
          format: "markdown",
          deepCapture: deepEnabled
        })
      }
    }

    if (article?.error) throw new Error(article.error)
    if (!article) throw new Error("内容提取失败")
    return { article, pageUrl: tab.url || "" }
  }

  const handleSendWebhook = useCallback(async () => {
    setWebhookSending(true)
    setWebhookStatus("正在发送到 Webhook...")
    try {
      const { article, pageUrl } = await getArticleForWebhook()
      const payload = await buildPayload(article, pageUrl, getSelectionType())
      await sendWebhook(payload)
      setWebhookStatus("已发送到 Webhook")
    } catch (e) {
      setWebhookStatus(`发送失败: ${e.message}`)
    } finally {
      setWebhookSending(false)
    }
  }, [pickedData, deepCapture, virtualListDetected, webhookConfig, buildPayload, sendWebhook, getArticleForWebhook, getSelectionType])



  const handleTestWebhook = useCallback(async () => {
    setWebhookSending(true)
    setWebhookStatus("正在发送测试请求...")
    try {
      const payload = {
        event: "webhook.test",
        source: "FlowPage",
        timestamp: Math.floor(Date.now() / 1000),
        data: { message: "FlowPage Webhook Test", id: `test_${Date.now()}` }
      }
      await sendWebhook(payload, true)
      setWebhookStatus("测试请求已发送")
    } catch (e) {
      setWebhookStatus(`测试失败: ${e.message}`)
    } finally {
      setWebhookSending(false)
    }
  }, [webhookConfig])

  const handleCopy = useCallback(async () => {
    setCopying(true)
    setStatus("正在转换并复制...")
    try {
      let article = pickedData
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error("无法获取当前页面")

      const deepEnabled = deepCapture && virtualListDetected

      if (!article || deepEnabled) {
        if (pickedData?.selectorPath) {
          article = await chrome.tabs.sendMessage(tab.id, { 
            type: "EXTRACT_BY_SELECTOR",
            selectorPath: pickedData.selectorPath,
            format: "markdown",
            deepCapture: true
          })
          if (article && pickedData?.title) article.title = pickedData.title
        } else {
          article = await chrome.tabs.sendMessage(tab.id, { 
            type: "EXTRACT_CONTENT",
            format: "markdown",
            deepCapture: deepEnabled 
          })
        }
      }

      if (article?.error) throw new Error(article.error)
      if (!article) throw new Error("内容提取失败")

      // 优先在本地进行 Markdown 转换，避免依赖不稳定的后端服务
      const text = await convertToMarkdown(article.content, article.title, tab.url || "")
      await navigator.clipboard.writeText(text)
      setStatus("已成功复制到剪贴板！")

      await Promise.all([
        maybeAutoSendWebhook(article, tab.url || ""),
        maybeSaveToKnowledgeBase(article, tab.url || "")
      ])
      
      setPickedData(null)
      chrome.storage.local.remove("lastPickedData")
    } catch (err) {
      setStatus(`复制失败: ${err.message}`)
    } finally {
      setCopying(false)
    }
  }, [pickedData, theme, themes, deepCapture, virtualListDetected, setPickedData, webhookConfig])

  const handleExport = useCallback(async (params?: any) => {
    setLoading(true)
    setStatus("正在处理数据...")
    
    try {
      let article = params || pickedData
      let needsImageProcess = false
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error("无法获取当前页面")

      const deepEnabled = deepCapture && virtualListDetected

      if (!article) {
        article = await chrome.tabs.sendMessage(tab.id, { 
          type: "EXTRACT_CONTENT",
          format: format,
          deepCapture: deepEnabled
        })
      } else if (deepEnabled && pickedData?.selectorPath) {
        article = await chrome.tabs.sendMessage(tab.id, { 
          type: "EXTRACT_BY_SELECTOR",
          selectorPath: pickedData.selectorPath,
          format: format,
          deepCapture: true
        })
        if (article && pickedData?.title) article.title = pickedData.title
      } else {
        needsImageProcess = format === "pdf"
      }

      if (needsImageProcess && article) {
        setStatus("正在内联图片 (Base64)...")
        const res = await chrome.tabs.sendMessage(tab.id, {
          type: "PROCESS_IMAGES",
          html: article.content
        })
        if (res.error) throw new Error(res.error)
        article = { ...article, content: res.html }
      }
      
      if (article?.error) throw new Error(article.error)
      if (!article) {
        setStatus("提取失败，请重试")
        setLoading(false)
        return
      }

      setStatus(`正在通过后端转换为 ${format.toUpperCase()}...`)

      const response = await fetch("http://localhost:3000/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: article.content,
          css: themes[theme].css,
          title: article.title,
          format: format
        })
      })

      if (!response.ok) {
        throw new Error(`后端错误: ${await response.text()}`)
      }

      if (format === "markdown") {
        const text = await response.text()
        const blob = new Blob([text], { type: "text/markdown" })
        const url = URL.createObjectURL(blob)
        const filename = `${article.title || "export"}.md`
        await chrome.downloads.download({ url, filename, saveAs: true })
        setStatus("导出成功！")
        
        await Promise.all([
          maybeAutoSendWebhook(article, tab.url || ""),
          maybeSaveToKnowledgeBase(article, tab.url || "")
        ])
      } else {
        const arrayBuffer = await response.arrayBuffer()
        const blob = new Blob([arrayBuffer], { type: "application/pdf" })
        
        const reader = new FileReader()
        reader.onloadend = async () => {
          const dataUrl = reader.result as string
          let filename = `${article.title || "export"}.pdf`
          await chrome.downloads.download({ 
            url: dataUrl, 
            filename, 
            saveAs: true 
          })
          setStatus("导出成功！")
          
          await Promise.all([
            maybeAutoSendWebhook(article, tab.url || ""),
            maybeSaveToKnowledgeBase(article, tab.url || "")
          ])

          setLoading(false)
          setPickedData(null)
          chrome.storage.local.remove("lastPickedData")
        }
        reader.readAsDataURL(blob)
        return 
      }

      setPickedData(null)
      chrome.storage.local.remove("lastPickedData")
    } catch (err) {
      console.error(err)
      setStatus(`错误: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [pickedData, theme, themes, format, deepCapture, virtualListDetected, setPickedData, webhookConfig])

  return {
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
  }
}
