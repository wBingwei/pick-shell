/**
 * PDF 导出（浏览器端方案）
 *
 * 不再依赖后端 Puppeteer：把「纯净 HTML + 主题 CSS」交给一个扩展内的打印页，
 * 由 Chrome 自己的打印管线渲染成 PDF（用户在选择「另存为 PDF」后完成）。
 *
 * 好处：与后端同一个排版引擎（矢量、可选中、可搜索）、中文用系统字体、
 * 无需部署服务、内容不出本机。
 */

export const PRINT_JOB_KEY = "printJob"

/** 打印页在构建产物里的路径（对应源码 tabs/print.tsx） */
const PRINT_PAGE_PATH = "tabs/print.html"

export interface PrintJob {
  title: string
  /** 已经处理过图片的 HTML 片段 */
  html: string
  /** 主题 CSS（如 styles/modern.css 的内容） */
  css: string
}

/**
 * 暂存打印任务并打开打印页。
 *
 * 任务写在 chrome.storage.local 而不是内存里，这样即使侧边栏被关掉、
 * 打印页也依然能拿到内容。（大文档经由图片 Base64 内联后会超过默认 10MB 配额，
 * 所以 manifest 里声明了 unlimitedStorage。）
 */
export async function openPrintPage(job: PrintJob) {
  await chrome.storage.local.set({ [PRINT_JOB_KEY]: job })
  return chrome.tabs.create({ url: chrome.runtime.getURL(PRINT_PAGE_PATH), active: true })
}
